import 'server-only';
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { abortable } from '@/lib/ai/protocol/transport';
import { buildImageRequest, parseImageResponse, type ImageSource } from './protocol';
import type { ImageProviderData } from './config';
export class ImageHttpError extends Error {
  constructor(public readonly status: number, public readonly rawUsage: unknown, public readonly requestId: string | null, public readonly providerCode: string | null) {
    super(`Image HTTP ${status}`);
  }
}
/** A completed HTTP response can still fail the provider/result contract. */
export class ImageResponseError extends ImageHttpError {
  constructor(status: number, rawUsage: unknown, requestId: string | null, providerCode: string | null) {
    super(status, rawUsage, requestId, providerCode);
    this.message = 'Invalid image provider response';
  }
}
function responseMetadata(value: unknown, response: Response) {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const error = body.error as Record<string, unknown> | undefined;
  const output = body.output as Record<string, unknown> | undefined;
  return {
    rawUsage: body.usage ?? body.usageMetadata ?? null,
    requestId: response.headers.get('x-request-id') ?? (typeof body.request_id === 'string' ? body.request_id : null),
    providerCode: typeof error?.code === 'string' ? error.code : typeof body.code === 'string' ? body.code : typeof output?.code === 'string' ? output.code : null,
  };
}
const MAX_BYTES = 32 * 1024 * 1024;
export async function readImageBytes(response: Response, signal: AbortSignal) {
  if (!response.body) throw new Error('Empty image response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('Image response too large');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function safeFetch(url: string, init: RequestInit, signal: AbortSignal) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid image URL');
  const check = await abortable(validateApiEndpoint(url), signal);
  if (!check.valid) throw new Error('Blocked image endpoint');
  // A timed-out paid POST must never be automatically retried or downgraded.
  const response = await abortable(fetch(url, { ...init, signal, redirect: 'error' }), signal);
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse((await readImageBytes(response, signal)).toString('utf8')) ?? {}; } catch { /* Preserve HTTP status even for malformed/oversized error bodies. */ }
    const meta = responseMetadata(body, response);
    throw new ImageHttpError(response.status, meta.rawUsage, meta.requestId, meta.providerCode);
  }
  return response;
}
export async function requestImage(config: ImageProviderData, prompt: string, key: string, signal: AbortSignal) {
  const request = buildImageRequest(config, prompt, key);
  const response = await safeFetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) }, signal);
  let body: unknown;
  try {
    body = JSON.parse((await readImageBytes(response, signal)).toString('utf8'));
    return parseImageResponse(config.protocol, body);
  } catch {
    const meta = responseMetadata(body, response);
    throw new ImageResponseError(response.status, meta.rawUsage, meta.requestId, meta.providerCode);
  }
}
export async function downloadImage(source: ImageSource, signal: AbortSignal) {
  if (source.base64) {
    if (source.base64.length > MAX_BYTES * 4 / 3 || !/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(source.base64)) throw new Error('Invalid image data');
    return Buffer.from(source.base64, 'base64');
  }
  // Output URLs never receive the generation API's credentials.
  const response = await safeFetch(source.url!, { method: 'GET' }, signal);
  return readImageBytes(response, signal);
}
