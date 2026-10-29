import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), execute: vi.fn(), settle: vi.fn(), decrypt: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: mocks.transaction } }));
vi.mock('@/lib/security/encryption', () => ({ decrypt: mocks.decrypt }));
vi.mock('../generate', () => ({ executeImageJob: mocks.execute, settleImageGeneration: mocks.settle }));
import { runNextImageJob, startImageWorker } from '../worker';
let rows: { id: string; status: string; requestEncrypted: string }[];
let lock: Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  rows = [{ id: 'job-1', status: 'queued', requestEncrypted: 'encrypted' }];
  lock = Promise.resolve();
  mocks.decrypt.mockReturnValue(JSON.stringify({ prompt: 'image', ctx: { roomId: 1, targetUserId: 7 } }));
  // Model a committed claim with serialized access, including its persisted status.
  mocks.transaction.mockImplementation(fn => {
    const result = lock.then(() => fn({
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => rows.filter(r => r.status === 'queued').slice(0, 1) }) }) }) }) }),
      update: () => ({ set: (patch: { status: string }) => ({ where: async () => { Object.assign(rows.find(r => r.status === 'queued')!, patch); } }) }),
    }));
    lock = result.catch(() => {});
    return result;
  });
});
afterEach(() => {
  if (globalThis.__imageWorker) clearInterval(globalThis.__imageWorker.timer);
  globalThis.__imageWorker = undefined;
  vi.useRealTimers();
});
describe('durable image worker', () => {
  it('claims once across concurrent workers and does not replay a claimed attempt', async () => {
    const result = await Promise.all([runNextImageJob(), runNextImageJob()]);
    expect(result.sort()).toEqual([false, true]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(await runNextImageJob()).toBe(false);
    expect(rows[0].status).toBe('pending');
  });
  it('recovers queued work without the original agent invocation', async () => {
    expect(await runNextImageJob()).toBe(true);
    expect(mocks.execute).toHaveBeenCalledWith('job-1', expect.objectContaining({ ctx: { roomId: 1, targetUserId: 7 } }));
  });
  it('refunds an unreadable job without making a generation call', async () => {
    mocks.decrypt.mockImplementationOnce(() => { throw new Error('key changed'); });
    await runNextImageJob();
    expect(mocks.settle).toHaveBeenCalledWith('job-1', 'failed', [], null, null);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('starts another image job while the first is unresolved', async () => {
    vi.useFakeTimers();
    rows.push({ id: 'job-2', status: 'queued', requestEncrypted: 'encrypted' });
    let release!: () => void;
    mocks.execute.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    startImageWorker();
    await vi.advanceTimersByTimeAsync(2100);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    release();
  });
});
