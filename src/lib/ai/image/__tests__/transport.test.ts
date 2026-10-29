import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/security/url-guard', () => ({ validateApiEndpoint: vi.fn(async () => ({ valid: true })) }));
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { downloadImage, requestImage } from '../transport';
import { ImageProviderInput } from '../config';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('paid image transport boundaries', () => {
  it.each([
    { body: { code: 'DataInspectionFailed', request_id: 'req-body', usage: { image_count: 1 } }, code: 'DataInspectionFailed', usage: { image_count: 1 } },
    { body: { candidates: [], usageMetadata: { totalTokenCount: 123 } }, code: null, usage: { totalTokenCount: 123 } },
    { body: { output: { code: 'InvalidResult' }, usage: { output_tokens: 12 } }, code: 'InvalidResult', usage: { output_tokens: 12 } },
  ])('retains metadata when HTTP 200 has no usable image: $code', async ({ body, code, usage }) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'x-request-id': 'req-header' } }));
    vi.stubGlobal('fetch', fetch);
    const config = ImageProviderInput.parse({ name: 'test', modelType: 'gpt-image-2', model: 'gpt-image-2', protocol: 'openai-images', apiEndpoint: 'https://example.com/v1', size: '1024x1024', ratePerImage: 0 });
    await expect(requestImage(config, 'portrait', 'secret', AbortSignal.timeout(1000))).rejects.toMatchObject({ status: 200, rawUsage: usage, requestId: 'req-header', providerCode: code });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry an ambiguous upstream failure', async () => {
    const fetch = vi.fn(async () => new Response('upstream unavailable', { status: 503 })); vi.stubGlobal('fetch', fetch);
    const config = ImageProviderInput.parse({ name: 'test', modelType: 'gpt-image-2', model: 'gpt-image-2', protocol: 'openai-images', apiEndpoint: 'https://example.com/v1', size: '1024x1024', ratePerImage: 0 });
    await expect(requestImage(config, 'portrait', 'secret', AbortSignal.timeout(1000))).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual(['https://example.com/v1/images/generations', expect.objectContaining({ redirect: 'error' })]);
  });
  it('preserves error usage, request ID and provider code without retrying', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'upstream_failed' }, usage: { output_tokens: 123 } }), { status: 502, headers: { 'x-request-id': 'req-1' } }));
    vi.stubGlobal('fetch', fetch);
    const config = ImageProviderInput.parse({ name: 'test', modelType: 'gpt-image-2', model: 'gpt-image-2', protocol: 'openai-images', apiEndpoint: 'https://example.com/v1', size: '1024x1024', ratePerImage: 0 });
    await expect(requestImage(config, 'portrait', 'secret', AbortSignal.timeout(1000))).rejects.toMatchObject({ status: 502, rawUsage: { output_tokens: 123 }, requestId: 'req-1', providerCode: 'upstream_failed' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('downloads artifacts with no provider credentials and blocks redirects', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('image')); vi.stubGlobal('fetch', fetch);
    await downloadImage({ url: 'https://cdn.example.com/a.png' }, AbortSignal.timeout(1000));
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/a.png', expect.objectContaining({ method: 'GET', redirect: 'error' }));
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers');
  });
  it('blocks private destinations before fetching', async () => {
    vi.mocked(validateApiEndpoint).mockResolvedValueOnce({ valid: false, error: 'blocked' });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(downloadImage({ url: 'https://127.0.0.1/image' }, AbortSignal.timeout(1000))).rejects.toThrow('Blocked');
    expect(fetch).not.toHaveBeenCalled();
  });
});
