import { describe, expect, it, vi } from 'vitest';
vi.mock('../client', () => ({ complete: vi.fn(async () => ({ status: 'completed' })) }));
vi.mock('../../usage', () => ({ recordTokenUsage: vi.fn() }));
import { complete } from '../client';
import { completeForProvider } from '../provider';
describe('model request defaults', () => {
  it('honors explicitly disabled streaming and caps feature output budgets', async () => {
    await completeForProvider({ id: 1, apiEndpoint: 'https://api.example/v1', protocolConfig: { version: 1, protocol: 'chat', stream: false, maxOutputTokens: 100 } }, 'key', 2, { model: 'm', messages: [], stream: true, maxOutputTokens: 200 });
    expect(complete).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ stream: false, maxOutputTokens: 100 }), expect.any(Function));
  });
  it('uses streaming defaults and keeps a smaller feature output budget', async () => {
    await completeForProvider({ id: 1, apiEndpoint: 'https://api.example/v1', protocolConfig: { version: 1, protocol: 'responses', stream: true, maxOutputTokens: 100 } }, 'key', 2, { model: 'm', messages: [], maxOutputTokens: 10 });
    expect(complete).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ stream: true, maxOutputTokens: 10 }), expect.any(Function));
  });
});
