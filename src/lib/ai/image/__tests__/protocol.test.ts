import { describe, expect, it } from 'vitest';
import { IMAGE_MODELS, ImageProviderInput, imageSizes, type ImageProviderData } from '../config';
import { buildImageRequest, parseImageResponse } from '../protocol';
const config = (id: string): ImageProviderData => {
  const model = IMAGE_MODELS.find(m => m.id === id)!;
  return ImageProviderInput.parse({ name: 'Test', modelType: id, model: model.model, protocol: model.protocols[0], apiEndpoint: model.endpoint, size: model.sizes[0], ratePerImage: 1 });
};
describe('image model contracts', () => {
  it.each(IMAGE_MODELS.map(m => m.id))('validates %s defaults and builds a request', id => {
    const c = config(id);
    expect(buildImageRequest(c, 'A TRPG portrait', 'secret').url).toMatch(/^https:/);
    expect(imageSizes(id, c.protocol)).toContain(c.size);
  });
  it('rejects incompatible protocols, invalid sizes, URLs and rates before submission', () => {
    for (const patch of [{ protocol: 'dashscope' }, { size: '90000x90000' }, { ratePerImage: -1 }, { ratePerImage: Infinity }, { apiEndpoint: 'https://user:secret@example.com/v1' }, { apiEndpoint: 'http://example.com/v1' }]) {
      expect(ImageProviderInput.safeParse({ ...config('gpt-image-2'), ...patch }).success).toBe(false);
    }
  });
  it('sends explicit single-image count and native DashScope size, not chat-compatible payload', () => {
    const req = buildImageRequest(config('wan2.7-image-pro'), 'portrait', 'key');
    expect(req.url).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(req.body).toMatchObject({ input: { messages: [{ role: 'user', content: [{ text: 'portrait' }] }] }, parameters: { n: 1, size: '1024*1024', watermark: false } });
  });
  it('does not send OpenAI n or quality to Seedream', () => {
    const { body } = buildImageRequest(config('doubao-seedream-5.0-pro'), 'portrait', 'key');
    expect(body).toMatchObject({ size: '1K', watermark: false, response_format: 'b64_json' });
    expect(body).not.toHaveProperty('n'); expect(body).not.toHaveProperty('quality');
  });
  it('uses native Gemini authentication and image generation configuration', () => {
    const req = buildImageRequest(config('nano-banana-2.1'), 'portrait', 'key');
    expect(req.headers).toHaveProperty('x-goog-api-key', 'key');
    expect(req.headers).not.toHaveProperty('Authorization');
    expect(req.body).toHaveProperty('generationConfig', { responseModalities: ['IMAGE'], imageConfig: { imageSize: '1K', aspectRatio: '1:1' } });
  });
});
describe('image response parsing', () => {
  it('accepts OpenAI/Seedream base64 and URL outputs while retaining raw usage', () => {
    expect(parseImageResponse('openai-images', { data: [{ b64_json: 'YWJj' }, { url: 'https://cdn.example/a.png' }], usage: { output_tokens: 10 } })).toEqual({ sources: [{ base64: 'YWJj' }, { url: 'https://cdn.example/a.png' }], rawUsage: { output_tokens: 10 } });
  });
  it('ignores Gemini thought images', () => {
    const result = parseImageResponse('gemini', { candidates: [{ content: { parts: [{ thought: true, inlineData: { data: 'hidden' } }, { inlineData: { data: 'YWJj', mimeType: 'image/png' } }] } }] });
    expect(result.sources).toEqual([{ base64: 'YWJj' }]); expect(result.rawUsage).toBeNull();
  });
  it('accepts DashScope images without a type discriminator', () => {
    expect(parseImageResponse('dashscope', { output: { choices: [{ message: { content: [{ image: 'https://cdn.example/a.png' }] } }] } }).sources).toEqual([{ url: 'https://cdn.example/a.png' }]);
  });
  it.each([{ code: 'DataInspectionFailed' }, { error: { message: 'blocked' } }, { output: { code: 'Failed' } }, { data: [] }, { candidates: [{ content: { parts: [{ text: 'refused' }] } }] }])('rejects failure or empty response %j', body => {
    expect(() => parseImageResponse('openai-images', body)).toThrow();
  });
});
