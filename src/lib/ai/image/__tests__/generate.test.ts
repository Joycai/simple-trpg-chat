import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn(), download: vi.fn(), dispatch: vi.fn(), transaction: vi.fn(), update: vi.fn(), select: vi.fn(), write: vi.fn(), metadata: vi.fn(), buffer: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction, update: mocks.update, select: mocks.select } }));
vi.mock('../worker', () => ({ startImageWorker: vi.fn() }));
vi.mock('../job-access', () => ({ imageJobAllowed: vi.fn(async () => true) }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'zh', getTranslations: async () => (key: string) => key }));
vi.mock('../providers', () => ({ resolveImageProvider: mocks.resolve }));
vi.mock('../transport', async importOriginal => ({ ...await importOriginal<typeof import('../transport')>(), requestImage: mocks.request, downloadImage: mocks.download }));
vi.mock('@/lib/security/encryption', () => ({ decrypt: () => 'secret', encrypt: (value: string) => 'encrypted:' + value }));
vi.mock('@/lib/messaging/router', () => ({ dispatchMessage: mocks.dispatch }));
vi.mock('@/lib/media/uploads', () => ({ ensureChatImageDir: async () => '/tmp/images' }));
vi.mock('node:fs/promises', () => ({ default: { writeFile: mocks.write } }));
vi.mock('sharp', () => ({ default: () => ({ metadata: mocks.metadata, rotate: () => ({ webp: () => ({ toBuffer: mocks.buffer }) }) }) }));
import { generateImageTool, executeImageJob, settleImageGeneration, type ImageJob } from '../generate';
import type { AgentToolContext } from '../../agent-tool-handlers';
import { imageJobAllowed } from '../job-access';
const context = (): AgentToolContext => ({ roomId: 42, botUserId: 9, botNickname: 'Painter', room: { hostId: 1 } as AgentToolContext['room'], replyIsPrivate: true, targetUserId: 7, imageProviderId: 5 });
const job = (): ImageJob => ({ config: {} as ImageJob['config'], key: 'secret', prompt: 'Portrait', locale: 'zh', providerId: 5, ctx: { roomId: 42, botUserId: 9, botNickname: 'Painter', replyIsPrivate: true, targetUserId: 7, hostId: 1 } });
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
  it('persists the encrypted original delivery context before acknowledging the job', async () => {
    const inserted: Record<string, unknown>[] = [];
    mocks.transaction.mockImplementationOnce(async fn => fn({
      select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 1, role: 'admin', aiPoints: 0 }] }) }) }),
      insert: () => ({ values: async (data: Record<string, unknown>) => { inserted.push(data); } }),
    }));
    const ctx = context();
    const result = await generateImageTool({ prompt: 'Portrait' }, ctx);
    ctx.targetUserId = 88;
    expect(result).toMatchObject({ success: true, status: 'queued' });
    expect(inserted[0]).toMatchObject({ status: 'queued', reservedPoints: 0 });
    const stored = JSON.parse((inserted[0].requestEncrypted as string).replace('encrypted:', ''));
    expect(stored.ctx).toMatchObject({ roomId: 42, botUserId: 9, targetUserId: 7, replyIsPrivate: true });
    expect(stored.prompt).toBe('Portrait');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('accepts a new submission while an earlier image job is still generating', async () => {
    let release!: (value: unknown) => void;
    mocks.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = executeImageJob('first', job());
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    expect(await generateImageTool({ prompt: 'Another picture' }, context())).toMatchObject({ success: true, status: 'queued' });
    release({ sources: [{ base64: 'YWJj' }], rawUsage: null });
    await first;
  });
  it('does not generate after the original bot or recipient loses access', async () => {
    vi.mocked(imageJobAllowed).mockResolvedValueOnce(false);
    expect(await executeImageJob('attempt', job())).toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('queues once per turn and returns without waiting for the upstream request', async () => {
    const ctx = context();
    expect(await generateImageTool({ prompt: 'Portrait' }, ctx)).toMatchObject({ success: true, status: 'queued', jobId: expect.any(String) });
    expect(await generateImageTool({ prompt: 'Again' }, ctx)).toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it('delivers a queued image only to its original DM', async () => {
    expect(await executeImageJob('attempt', job())).toMatchObject({ success: true });
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ audience: 'dm', targetUserId: 7, actorUserId: 9, roomId: 42, type: 'image' }));
  });
  it('persists usage from an unusable HTTP 200 response and sends a failure notice', async () => {
    const { ImageResponseError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.request.mockRejectedValue(new ImageResponseError(200, { totalTokenCount: 123 }, 'req-empty', null));
    expect(await executeImageJob('attempt', job())).toMatchObject({ success: false });
    expect(writes).toContainEqual({ rawUsage: { totalTokenCount: 123 }, upstreamError: { status: 200, requestId: 'req-empty', code: null } });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', audience: 'dm', targetUserId: 7, content: 'jobFailed' }));
  });
  it('persists the encrypted receipt before downloading', async () => {
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.download.mockImplementation(async () => {
      expect(writes[0]).toMatchObject({ status: 'generated', imageCount: 1, rawUsage: { output_tokens: 12 } });
      expect(writes[0].receiptEncrypted).toContain('encrypted:');
      return Buffer.from('image');
    });
    await executeImageJob('attempt', job());
  });
  it('counts a committed message as delivered when broadcasting fails', async () => {
    mocks.dispatch.mockRejectedValue(new Error('broadcast failed'));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ id: 123 }] }) });
    expect(await executeImageJob('attempt', job())).toMatchObject({ success: true });
  });
  it('leaves ambiguous delivery pending when its durable lookup fails', async () => {
    mocks.dispatch.mockRejectedValue(new Error('broadcast failed'));
    mocks.select.mockReturnValue({ from: () => ({ where: async () => { throw new Error('database unavailable'); } }) });
    await executeImageJob('attempt', job());
    expect(mocks.transaction).not.toHaveBeenCalled(); // no refund on ambiguous delivery
  });
  it('retains billed usage and safe error metadata on upstream failure', async () => {
    const { ImageHttpError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.request.mockRejectedValue(new ImageHttpError(502, { output_tokens: 123 }, 'req-1', 'upstream_failed'));
    await executeImageJob('attempt', job());
    expect(writes).toContainEqual({ rawUsage: { output_tokens: 123 }, upstreamError: { status: 502, requestId: 'req-1', code: 'upstream_failed' } });
  });
  it('does not erase generation usage when the artifact CDN returns an HTTP error', async () => {
    const { ImageHttpError } = await import('../transport');
    const writes: Record<string, unknown>[] = [];
    mocks.update.mockReturnValue({ set: (data: Record<string, unknown>) => ({ where: async () => { writes.push(data); } }) });
    mocks.download.mockRejectedValue(new ImageHttpError(403, null, null, null));
    await executeImageJob('attempt', job());
    expect(writes.at(-1)).toMatchObject({ rawUsage: { output_tokens: 12 }, upstreamError: { status: 403 } });
  });
  it('blocks unavailable providers and insufficient points before queueing', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    expect(await generateImageTool({ prompt: 'Portrait' }, context())).toMatchObject({ success: false });
    mocks.transaction.mockResolvedValueOnce(false);
    expect(await generateImageTool({ prompt: 'Portrait' }, context())).toMatchObject({ success: false });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('does not retry failed paid requests', async () => {
    mocks.request.mockRejectedValue(new Error('timeout with unknown upstream outcome'));
    expect(await executeImageJob('attempt', job())).toMatchObject({ success: false });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', content: 'jobFailed' }));
  });
  it('keeps already delivered partial output if a later download fails', async () => {
    mocks.request.mockResolvedValue({ sources: [{ base64: 'YWJj' }, { url: 'https://cdn.example/b.png' }], rawUsage: null });
    mocks.download.mockResolvedValueOnce(Buffer.from('image')).mockRejectedValueOnce(new Error('download failed'));
    const result = await executeImageJob('attempt', job());
    expect(result.success).toBe(true); expect(result.images).toHaveLength(1);
    expect(mocks.dispatch).toHaveBeenCalledTimes(2); // image plus partial-delivery notice
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
