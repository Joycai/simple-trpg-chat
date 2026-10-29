import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ providers: [] as Record<string, unknown>[], complete: vi.fn(), saved: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: '1', role: 'host' } }) }));
vi.mock('@/db', () => ({ sqlNow: () => '', db: { select: () => ({ from: () => ({ where: async () => state.providers }) }) } }));
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/security/encryption', () => ({ decrypt: () => 'key' }));
vi.mock('@/lib/ai/protocol/client', () => ({ complete: state.complete }));
vi.mock('@/lib/ai/protocol/provider', () => ({ completeForProvider: state.saved }));
import { testAiConnection } from '../ai';
const endpoint = 'https://llm.example/v1';
const result = { status: 'completed', message: { content: 'pong' } };
afterEach(() => { vi.clearAllMocks(); state.providers = []; });
it('lets the protocol client apply saved thinking and output budgets to a connection probe', async () => {
  state.providers = [{ id: 1, apiEndpoint: endpoint, apiKeyEncrypted: 'encrypted', protocolConfig: { version: 1, protocol: 'messages', reasoning: { budgetTokens: 1024 }, capabilities: { thinkingDialect: 'budget' }, maxOutputTokens: 4096 } }];
  state.saved.mockResolvedValue(result);
  expect(await testAiConnection(endpoint, 'key', 'model')).toEqual({ success: true });
  expect(state.saved.mock.calls[0][3]).not.toHaveProperty('maxOutputTokens');
  expect(state.saved.mock.calls[0][3].timeoutMs).toBe(10000);
});
it('retains the five-token limit for an unsaved legacy Chat probe', async () => {
  state.complete.mockResolvedValue(result);
  expect(await testAiConnection(endpoint, 'key', 'model')).toEqual({ success: true });
  expect(state.complete.mock.calls[0][1].maxOutputTokens).toBe(5);
});
