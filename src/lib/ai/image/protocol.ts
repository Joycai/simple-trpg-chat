import type { ImageProviderData } from './config';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export function buildImageRequest(config: ImageProviderData, prompt: string, key: string) {
  const base = config.apiEndpoint.replace(/\/+$/, '');
  let path = '/images/generations';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Json;
  if (config.protocol === 'gemini') {
    path = `/models/${encodeURIComponent(config.model)}:generateContent`;
    headers['x-goog-api-key'] = key;
    body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { imageSize: config.size, aspectRatio: config.aspectRatio } } };
  } else {
    headers.Authorization = `Bearer ${key}`;
    if (config.protocol === 'dashscope') {
      path = '/services/aigc/multimodal-generation/generation';
      body = { model: config.model, input: { messages: [{ role: 'user', content: [{ text: prompt }] }] }, parameters: { n: 1, size: config.size.replace('x', '*'), watermark: config.watermark } };
    } else if (config.protocol === 'seedream') {
      body = { model: config.model, prompt, size: config.size, response_format: 'b64_json', watermark: config.watermark };
    } else {
      body = { model: config.model, prompt, n: 1, size: config.size, quality: config.quality };
    }
  }
  return { url: base + path, headers, body };
}
export interface ImageSource { base64?: string; url?: string }
export function parseImageResponse(protocol: ImageProviderData['protocol'], value: unknown): { sources: ImageSource[]; rawUsage: unknown } {
  const root = obj(value);
  if (root.error || root.code || obj(root.output).code) throw new Error('Image provider rejected the request');
  const sources: ImageSource[] = [];
  const add = (base64: unknown, url: unknown) => {
    if (typeof base64 === 'string' && base64) sources.push({ base64 });
    else if (typeof url === 'string' && url) sources.push({ url });
  };
  if (protocol === 'gemini') {
    for (const candidate of arr(root.candidates)) for (const part of arr(obj(obj(candidate).content).parts)) {
      const p = obj(part);
      if (p.thought === true) continue;
      const inline = obj(p.inlineData ?? p.inline_data);
      if (typeof inline.mimeType === 'string' && !inline.mimeType.startsWith('image/')) continue;
      add(inline.data, undefined);
    }
  } else if (protocol === 'dashscope') {
    for (const choice of arr(obj(root.output).choices)) for (const part of arr(obj(obj(choice).message).content)) add(undefined, obj(part).image);
  } else {
    for (const item of arr(root.data)) add(obj(item).b64_json, obj(item).url);
  }
  if (!sources.length || sources.length > 4) throw new Error('Invalid image result count');
  return { sources, rawUsage: root.usage ?? root.usageMetadata ?? null };
}
