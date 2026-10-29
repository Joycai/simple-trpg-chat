import 'server-only';
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { ProtocolError } from './errors';
import { object } from './wire';
import type { Wire } from './types';
const MAX_BYTES = 8 * 1024 * 1024;
/** Abort races also cover DNS and mocked transports that ignore RequestInit.signal. */
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let listener: () => void = () => {};
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      listener = () => reject(signal.reason);
      signal.addEventListener('abort', listener, { once: true });
    })]);
  } finally { signal.removeEventListener('abort', listener); }
}
export async function requestHttp(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const check = await abortable(validateApiEndpoint(url), signal);
    if (!check.valid) throw new ProtocolError('config', 'Blocked outbound AI endpoint');
    let response: Response;
    try { response = await abortable(fetch(url, { ...init, signal, redirect: 'error' }), signal); }
    catch (e) { if (signal.aborted) throw e; throw new ProtocolError('network', 'AI network request failed'); }
    if (response.ok) return response;
    // Some gateways return usage even on non-2xx failures. Retain it, and
    // never replay a request that carries evidence of generation.
    let errorBody: Wire = {};
    try { errorBody = await readJson(response, signal); }
    catch (error) { if (signal.aborted) throw error; }
    const rawUsage = object(errorBody.usage ?? errorBody.usageMetadata ?? object(errorBody.response).usage);
    const hasGeneration = Object.keys(rawUsage).length > 0 || !!errorBody.choices || !!errorBody.output || !!errorBody.candidates;
    if (hasGeneration || attempt >= 2 || ![429, 502, 503, 504].includes(response.status)) {
      const failure = new ProtocolError('upstream', `AI API error (${response.status})`, undefined, response.status);
      failure.rawUsage = rawUsage;
      throw failure;
    }
    const after = response.headers.get('retry-after');
    const delay = after ? (/^\d+(\.\d+)?$/.test(after) ? Number(after) * 1000 : Date.parse(after) - Date.now()) : 1000 * 2 ** attempt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await abortable(new Promise<void>(resolve => { timer = setTimeout(resolve, Math.min(16000, Math.max(0, Number.isFinite(delay) ? delay : 1000))); }), signal); }
    finally { clearTimeout(timer); }
  }
}
async function* chunks(response: Response, signal: AbortSignal, idleMs: number) {
  if (!response.body) throw new ProtocolError('response', 'Empty HTTP response');
  const reader = response.body.getReader(); let size = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new AbortController();
      try {
        timer = setTimeout(() => idle.abort(new ProtocolError('timeout', 'AI response body timed out')), idleMs);
        const { done, value } = await abortable(reader.read(), AbortSignal.any([signal, idle.signal]));
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new ProtocolError('response', 'AI response exceeded size limit');
        yield decoder.decode(value, { stream: true });
      } finally { clearTimeout(timer); }
    }
    yield decoder.decode();
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function readJson(response: Response, signal: AbortSignal): Promise<Wire> {
  let text = ''; for await (const chunk of chunks(response, signal, 120000)) text += chunk;
  try { const parsed: unknown = JSON.parse(text); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return object(parsed); }
  catch { throw new ProtocolError('response', 'Invalid JSON response from AI'); }
}
export async function* readSse(response: Response, signal: AbortSignal): AsyncGenerator<Wire> {
  let buffer = '', data: string[] = [];
  const activity = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => activity.abort(new ProtocolError('timeout', 'AI event stream timed out')), 60000);
  };
  reset();
  try {
    for await (const chunk of chunks(response, AbortSignal.any([signal, activity.signal]), 60000)) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ''); buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (!data.length) continue;
          const payload = data.join('\n'); data = [];
          if (payload === '[DONE]') return;
          let parsed: unknown;
          try { parsed = JSON.parse(payload); } catch { throw new ProtocolError('response', 'Invalid SSE JSON'); }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProtocolError('response', 'Invalid SSE object');
          reset(); // Comments/heartbeat bytes do not extend the first-event deadline.
          yield object(parsed);
        } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (buffer.trim() || data.length) throw new ProtocolError('response', 'Truncated SSE frame');
  } finally { clearTimeout(timer!); }
}
