import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn(), download: vi.fn(), dispatch: vi.fn(), transaction: vi.fn(), update: vi.fn(), select: vi.fn(), write: vi.fn(), metadata: vi.fn(), buffer: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction, update: mocks.update, select: mocks.select } }));
vi.mock('../providers', () => ({ resolveImageProvider: mocks.resolve }));
vi.mock('../transport', async importOriginal => ({ ...await importOriginal<typeof import('../transport')>(), requestImage: mocks.request, downloadImage: mocks.download }));
vi.mock('@/lib/security/encryption', () => ({ decrypt: () => 'secret', encrypt: (value: string) => 'encrypted:' + value }));
vi.mock('@/lib/messaging/router', () => ({ dispatchMessage: mocks.dispatch }));
vi.mock('@/lib/media/uploads', () => ({ ensureChatImageDir: async () => '/tmp/images' }));
vi.mock('node:fs/promises', () => ({ default: { writeFile: mocks.write } }));
vi.mock('sharp', () => ({ default: () => ({ metadata: mocks.metadata, rotate: () => ({ webp: () => ({ toBuffer: mocks.buffer }) }) }) }));
import { generateImageTool, settleImageGeneration } from '../generate';
import type { AgentToolContext } from '../../agent-tool-handlers';
const context = (): AgentToolContext => ({ roomId: 42, botUserId: 9, botNickname: 'Painter', room: { hostId: 1 } as AgentToolContext['room'], replyIsPrivate: true, targetUserId: 7, imageProviderId: 5 });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue({ row: { id: 5, name: 'Images', isShared: true, apiKeyEncrypted: 'encrypted' }, config: { ratePerImage: 2, model: 'gpt-image-2' } });
  mocks.request.mockResolvedValue({ sources: [{ base64: 'YWJj' }], rawUsage: { output_tokens: 12 } });
  mocks.download.mockResolvedValue(Buffer.from('image'));
  mocks.metadata.mockResolvedValue({ format: 'png' }); mocks.buffer.mockResolvedValue(Buffer.from('webp'));
  mocks.update.mockReturnValue({ set: () => ({ where: async () => {} }) });
  mocks.transaction.mockResolvedValue(true);
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
});
describe('imageGen tool', () => {
  it('persists usage from an HTTP-successful but unusable response without delivering or retrying', async () => {
    const { ImageResponseError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.request.mockRejectedValue(new ImageResponseError(200, { totalTokenCount: 123 }, 'req-empty', null));
    const ctx = context();
    expect(await generateImageTool({ prompt: 'Portrait' }, ctx)).toMatchObject({ success: false });
    expect(writes).toContainEqual({ rawUsage: { totalTokenCount: 123 }, upstreamError: { status: 200, requestId: 'req-empty', code: null } });
    await generateImageTool({ prompt: 'Again' }, ctx);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('delivers only in the triggering DM and prevents another paid attempt in the same turn', async () => {
    const ctx = context();
    expect(await generateImageTool({ prompt: 'Portrait' }, ctx)).toMatchObject({ success: true });
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ audience: 'dm', targetUserId: 7, actorUserId: 9, roomId: 42, type: 'image' }));
    expect(await generateImageTool({ prompt: 'Retry' }, ctx)).toMatchObject({ success: false });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('persists the encrypted receipt before downloading', async () => {
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.download.mockImplementation(async () => {
      expect(writes[0]).toMatchObject({ status: 'generated', imageCount: 1, rawUsage: { output_tokens: 12 } });
      expect(writes[0].receiptEncrypted).toContain('encrypted:');
      return Buffer.from('image');
    });
    await generateImageTool({ prompt: 'Portrait' }, context());
  });
  it('counts a committed message as delivered when broadcasting fails', async () => {
    mocks.dispatch.mockRejectedValue(new Error('broadcast failed'));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ id: 123 }] }) });
    expect(await generateImageTool({ prompt: 'Portrait' }, context())).toMatchObject({ success: true });
  });
  it('leaves ambiguous delivery pending when its durable lookup fails', async () => {
    mocks.dispatch.mockRejectedValue(new Error('broadcast failed'));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => { throw new Error('database unavailable'); } }) });
    await generateImageTool({ prompt: 'Portrait' }, context());
    expect(mocks.transaction).toHaveBeenCalledTimes(1); // reservation only, no refund
  });
  it('retains billed usage and safe error metadata on upstream failure', async () => {
    const { ImageHttpError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.request.mockRejectedValue(new ImageHttpError(502, { output_tokens: 123 }, 'req-1', 'upstream_failed'));
    await generateImageTool({ prompt: 'Portrait' }, context());
    expect(writes).toContainEqual({ rawUsage: { output_tokens: 123 }, upstreamError: { status: 502, requestId: 'req-1', code: 'upstream_failed' } });
  });
  it('does not erase generation usage when the artifact CDN returns an HTTP error', async () => {
    const { ImageHttpError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.download.mockRejectedValue(new ImageHttpError(403, null, null, null));
    await generateImageTool({ prompt: 'Portrait' }, context());
    expect(writes.at(-1)).toMatchObject({ rawUsage: { output_tokens: 12 }, upstreamError: { status: 403 } });
  });
  it('blocks unavailable providers and insufficient points before any request', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    expect(await generateImageTool({ prompt: 'Portrait' }, context())).toMatchObject({ success: false });
    mocks.transaction.mockResolvedValueOnce(false);
    expect(await generateImageTool({ prompt: 'Portrait' }, context())).toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('does not retry failed paid requests', async () => {
    mocks.request.mockRejectedValue(new Error('timeout with unknown upstream outcome'));
    const ctx = context();
    expect(await generateImageTool({ prompt: 'Portrait' }, ctx)).toMatchObject({ success: false });
    await generateImageTool({ prompt: 'Again' }, ctx);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it('keeps already delivered partial output if a later download fails', async () => {
    mocks.request.mockResolvedValue({ sources: [{ base64: 'YWJj' }, { url: 'https://cdn.example/b.png' }], rawUsage: null });
    mocks.download.mockResolvedValueOnce(Buffer.from('image')).mockRejectedValueOnce(new Error('download failed'));
    const result = await generateImageTool({ prompt: 'Portrait' }, context());
    expect(result.success).toBe(true); expect(result.images).toHaveLength(1);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
});
describe('image settlement', () => {
  it('refunds the original reservation once, even after the current rate changes', async () => {
    const attempt = { status: 'pending', reservedPoints: 2, userId: 1 };
    const user = { id: 1, aiPoints: 8 };
    const updates: Record<string, unknown>[] = [];
    const logs: Record<string, unknown>[] = [];
    mocks.transaction.mockImplementation(async callback => {
      let selectIndex = 0;
      return callback({
        select: () => ({ from: () => ({ where: () => ({ for: async () => [selectIndex++ === 0 ? attempt : user] }) }) }),
        update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { updates.push(values); if (values.status) Object.assign(attempt, values); } }) }),
        insert: () => ({ values: async (values: Record<string, unknown>) => { logs.push(values); } }),
      });
    });
    await settleImageGeneration('id', 'failed', [], null, null);
    await settleImageGeneration('id', 'failed', [], null, null);
    expect(logs).toHaveLength(1); expect(logs[0]).toMatchObject({ amount: 2, beforePoints: 8, afterPoints: 10 });
    expect(updates).toContainEqual(expect.objectContaining({ status: 'failed', reservedPoints: 0, imageCount: null }));
  });
});
