import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiVendors } from '@/db/schema';
let session: { user: { id: string; role: string } } | null;
let vendors: unknown[] = [], models: unknown[] = [];
const writes = vi.fn();
vi.mock('@/auth', () => ({ auth: async () => session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/security/encryption', () => ({ encrypt: (s: string) => `encrypted:${s}`, decrypt: (s: string) => s.replace('encrypted:', '') }));
vi.mock('@/lib/security/url-guard', () => ({ validateApiEndpoint: async () => ({ valid: true }) }));
vi.mock('@/lib/ai/protocol/provider', () => ({ completeForProvider: vi.fn() }));
function chain(table: unknown) {
  const result = { where: () => result, for: () => result, limit: () => result, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(table === aiVendors ? vendors : models).then(resolve) }; return result;
}
const transaction = { select: () => ({ from: (table: unknown) => chain(table) }),
  insert: () => ({ values: async (v: unknown) => { writes(v); } }),
  update: () => ({ set: (v: unknown) => ({ where: async () => { writes(v); } }) }),
  delete: () => ({ where: async () => { writes('delete'); } }) };
vi.mock('@/db', () => ({ db: { transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction), select: () => transaction.select() }, sqlNow: () => 'now' }));
import { deleteAiVendor, saveAiModel, saveAiVendor } from '../ai-catalog';
const route = { protocol: 'chat', endpoint: 'https://api.example/v1', endpointMode: 'base' };
const input = { name: 'Model', model: 'm', protocol: 'chat', settings: {}, isShared: false, tokenRateInput: 0, tokenRateCached: 0, tokenRateOutput: 0 };
beforeEach(() => { vi.clearAllMocks(); session = { user: { id: '2', role: 'host' } }; models = []; vendors = [{ id: 1, ownerId: 2, name: 'Vendor', platform: 'custom', routes: [route], apiKeyEncrypted: 'encrypted:secret', apiKeyHint: 'cret' }]; });
describe('catalog mutations', () => {
  it.each([null, 'player'])('rejects unauthenticated/unauthorized role %s', async role => {
    session = role ? { user: { id: '2', role } } : null;
    expect(await saveAiModel(1, null, input)).toMatchObject({ success: false, error: 'forbidden' }); expect(writes).not.toHaveBeenCalled();
  });
  it('rejects missing or foreign vendor/model', async () => {
    vendors = []; expect((await saveAiModel(1, null, input)).success).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });
  it('does not let hosts share models or set paid rates', async () => {
    for (const update of [{ isShared: true }, { tokenRateInput: 1 }]) expect(await saveAiModel(1, null, { ...input, ...update })).toMatchObject({ success: false, error: 'forbidden' });
    expect(writes).not.toHaveBeenCalled();
  });
  it('materializes endpoint and encrypted credential from the owned vendor', async () => {
    expect(await saveAiModel(1, null, input)).toEqual({ success: true });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ vendorId: 1, apiEndpoint: route.endpoint, apiKeyEncrypted: 'encrypted:secret', protocolConfig: expect.objectContaining({ protocol: 'chat', model: 'm' }) }));
  });
  it('preserves credentials on blank key and propagates vendor edits', async () => {
    models = [{ ...input, id: 7, protocolConfig: { version: 1, protocol: 'chat' } }];
    expect(await saveAiVendor(1, { name: 'Renamed', platform: 'custom', routes: [{ ...route, endpoint: 'https://new.example/v1' }], apiKey: '' })).toEqual({ success: true });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ apiKeyEncrypted: 'encrypted:secret', apiEndpoint: 'https://new.example/v1' }));
  });
  it('keeps hidden legacy rates when a host edits their model', async () => {
    models = [{ ...input, id: 7, vendorId: 1, ownerId: 2, tokenRateInput: 2, tokenRateCached: 1, tokenRateOutput: 4 }];
    expect(await saveAiModel(1, 7, input)).toEqual({ success: true });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ tokenRateInput: 2, tokenRateCached: 1, tokenRateOutput: 4 }));
  });
  it('prevents removing an active route', async () => {
    models = [{ ...input, id: 7, protocolConfig: null }];
    expect(await saveAiVendor(1, { name: 'Vendor', platform: 'custom', routes: [{ ...route, protocol: 'responses' }] })).toMatchObject({ success: false, error: 'routeInUse' }); expect(writes).not.toHaveBeenCalled();
  });
  it('prevents deleting a vendor with models', async () => {
    models = [{ id: 7 }]; expect(await deleteAiVendor(1)).toMatchObject({ success: false, error: 'vendorNotEmpty' }); expect(writes).not.toHaveBeenCalled();
  });
  it('requires a credential for a new authenticated vendor', async () => {
    expect(await saveAiVendor(null, { name: 'Vendor', platform: 'custom', routes: [route] })).toMatchObject({ success: false, error: 'keyRequired' });
  });
});
