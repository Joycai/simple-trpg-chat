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
const completeForProvider = vi.fn();
vi.mock('@/lib/ai/protocol/provider', () => ({ completeForProvider: (...a: unknown[]) => completeForProvider(...a) }));
function chain(table: unknown) {
  const result = { where: () => result, for: () => result, limit: () => result, then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(table === aiVendors ? vendors : models).then(resolve) }; return result;
}
let deleteReturning: unknown[] = [{ id: 7 }];
const transaction = { select: () => ({ from: (table: unknown) => chain(table) }),
  insert: () => ({ values: async (v: unknown) => { writes(v); } }),
  update: () => ({ set: (v: unknown) => ({ where: async () => { writes(v); } }) }),
  delete: () => ({ where: () => ({
    returning: async () => { writes('delete'); return deleteReturning; },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(writes('delete')).then(resolve),
  }) }) };
vi.mock('@/db', () => ({ db: { transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction), select: () => transaction.select() }, sqlNow: () => 'now' }));
import { ProtocolError } from '@/lib/ai/protocol/errors';
import { deleteAiModel, deleteAiVendor, saveAiModel, saveAiVendor, testAiModel, updateSharedModelAdmin } from '../ai-catalog';
const route = { protocol: 'chat', endpoint: 'https://api.example/v1', endpointMode: 'base' };
const input = { name: 'Model', model: 'm', protocol: 'chat', settings: {}, isShared: false, tokenRateInput: 0, tokenRateCached: 0, tokenRateOutput: 0 };
beforeEach(() => { vi.clearAllMocks(); deleteReturning = [{ id: 7 }]; session = { user: { id: '2', role: 'host' } }; models = []; vendors = [{ id: 1, ownerId: 2, name: 'Vendor', platform: 'custom', routes: [route], apiKeyEncrypted: 'encrypted:secret', apiKeyHint: 'cret' }]; });
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
  it('lets another admin adjust rates/sharing or delete a shared model', async () => {
    session = { user: { id: '99', role: 'admin' } };
    models = [{ ...input, id: 7, ownerId: 2, vendorId: 1, isShared: true }];
    expect(await updateSharedModelAdmin(7, { isShared: false, tokenRateInput: 3, tokenRateCached: 0.5, tokenRateOutput: 6 })).toEqual({ success: true });
    expect(writes).toHaveBeenCalledWith(expect.objectContaining({ isShared: false, tokenRateInput: 3, tokenRateCached: 0.5, tokenRateOutput: 6 }));
    expect(await deleteAiModel(7)).toEqual({ success: true });
    expect(writes).toHaveBeenCalledWith('delete');
    deleteReturning = [];
    expect(await deleteAiModel(7)).toEqual({ success: false, error: 'forbidden' });
  });
  it('blocks non-admin from updateSharedModelAdmin or deleting foreign models', async () => {
    models = [{ ...input, id: 7, ownerId: 3, vendorId: 1, isShared: true }];
    expect(await updateSharedModelAdmin(7, { isShared: false, tokenRateInput: 0, tokenRateCached: 0, tokenRateOutput: 0 })).toMatchObject({ success: false, error: 'forbidden' });
    expect(await deleteAiModel(7)).toMatchObject({ success: false, error: 'forbidden' });
    expect(writes).not.toHaveBeenCalled();
  });
  it('maps protocol test failures to specific diagnostic keys', async () => {
    models = [{ ...input, id: 7, ownerId: 2, apiKeyEncrypted: 'encrypted:secret', apiEndpoint: route.endpoint, protocolConfig: null }];
    completeForProvider.mockRejectedValueOnce(new ProtocolError('timeout', 'timed out'));
    expect(await testAiModel(7)).toEqual({ success: false, error: 'testTimeout' });
    completeForProvider.mockRejectedValueOnce(new ProtocolError('upstream', 'AI API error (401)', undefined, 401));
    expect(await testAiModel(7)).toEqual({ success: false, error: 'testUpstreamStatus' });
    completeForProvider.mockResolvedValueOnce({ status: 'completed', message: { content: '   ' } });
    expect(await testAiModel(7)).toEqual({ success: false, error: 'emptyResponse' });
  });
});
