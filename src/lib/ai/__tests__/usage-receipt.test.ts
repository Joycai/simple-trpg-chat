import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiUsageAttempts, aiTokenUsages, aiPointLogs } from '@/db/schema';
import { normalizeUsage } from '../protocol/usage';
import { recordTokenUsage, type UsageReceipt } from '../usage';
const state = vi.hoisted(() => ({ ids: new Set<string>(), aggregates: [] as unknown[], logs: [] as Record<string, unknown>[], updates: [] as unknown[], fail: false, balance: 50 }));
vi.mock('@/db', () => ({ sqlNow: () => 'now', db: { transaction: async (callback: (tx: unknown) => Promise<void>) => {
  if (state.fail) throw new Error('storage unavailable');
  let selects = 0;
  const tx = {
    insert: (table: unknown) => ({ values: (value: Record<string, unknown>) => {
      if (table === aiUsageAttempts) return { onConflictDoNothing: () => ({ returning: async () => { if (state.ids.has(String(value.attemptId))) return []; state.ids.add(String(value.attemptId)); return [{ id: value.attemptId }]; } }) };
      if (table === aiTokenUsages) return { onConflictDoUpdate: async () => { state.aggregates.push(value); } };
      if (table === aiPointLogs) state.logs.push(value);
      return Promise.resolve();
    } }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => {
      const rows = selects++ === 0 ? [{ id: 1, name: 'p', model: 'm', isShared: true, tokenRateInput: 99, tokenRateCached: 99, tokenRateOutput: 99 }] : [{ id: 2, role: 'host', aiPoints: state.balance }];
      return Object.assign(Promise.resolve(rows), { for: async () => rows });
    } }) }) }),
    update: () => ({ set: (value: unknown) => ({ where: async () => { state.updates.push(value); } }) }),
  };
  await callback(tx);
} } }));
const receipt = (): UsageReceipt => ({ attemptId: 'attempt-1', model: 'm', protocol: 'chat', status: 'completed', day: '2026-10-29', rates: { input: 1, cached: 0.1, output: 2 }, usage: normalizeUsage('chat', { prompt_tokens: 1000000, prompt_tokens_details: { cached_tokens: 500000 }, completion_tokens: 100000 }) });
beforeEach(() => { state.ids.clear(); state.aggregates = []; state.logs = []; state.updates = []; state.fail = false; state.balance = 50; });
describe('request usage settlement', () => {
  it('deduplicates attempts and uses the original price snapshot', async () => {
    const r = receipt();
    await recordTokenUsage(2, 1, 1000000, 500000, 100000, r);
    await recordTokenUsage(2, 1, 1000000, 500000, 100000, r);
    expect(state.aggregates).toHaveLength(1); expect(state.logs).toHaveLength(1);
    expect(state.logs[0].amount).toBe(-0.75); expect(state.updates[0]).toEqual({ aiPoints: 49.25 });
  });
  it('preserves missing usage evidence without billing it as known zero', async () => {
    await recordTokenUsage(2, 1, 0, 0, 0, { ...receipt(), usage: normalizeUsage('chat') });
    expect(state.ids.size).toBe(1); expect(state.aggregates).toHaveLength(0); expect(state.logs).toHaveLength(0);
  });
  it('propagates persistence failure to the idempotent retry owner', async () => {
    state.fail = true; await expect(recordTokenUsage(2, 1, 1, 0, 1, receipt())).rejects.toThrow('storage unavailable');
    expect(state.ids.size).toBe(0);
  });
});


it('settles known cached input without inventing an uncached bucket', async () => {
  const r = { ...receipt(), usage: normalizeUsage('chat', { prompt_tokens_details: { cached_tokens: 500000 } }) };
  await recordTokenUsage(2, 1, 0, 500000, 0, r);
  expect(state.aggregates[0]).toMatchObject({ inputTokens: 500000, cachedInputTokens: 500000, outputTokens: 0 });
  expect(state.logs[0].amount).toBe(-0.05);
});

it('logs the actual deduction when the remaining balance is below the charge', async () => {
  state.balance = 0.1;
  await recordTokenUsage(2, 1, 1000000, 500000, 100000, receipt());
  expect(state.logs[0]).toMatchObject({ beforePoints: 0.1, afterPoints: 0, amount: -0.1 });
});
