import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: [] as unknown[], auth: vi.fn(), insert: vi.fn(), encrypt: vi.fn(), endpoint: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(mocks.rows).then(resolve), orderBy: async () => mocks.rows }) }) }), insert: mocks.insert } }));
vi.mock('@/lib/security/encryption', () => ({ encrypt: mocks.encrypt }));
vi.mock('@/lib/security/url-guard', () => ({ validateApiEndpoint: mocks.endpoint }));
vi.mock('@/lib/auth/room-access', () => ({ checkRoomAccess: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
import { saveImageProvider, getImageProviders } from '@/app/actions/image-providers';
import { resolveImageProvider, validImageAssignment } from '../providers';
const config = { name: 'test', modelType: 'gpt-image-2', model: 'gpt-image-2', protocol: 'openai-images', apiEndpoint: 'https://api.example.com/v1', size: '1024x1024', ratePerImage: 1, apiKey: 'private-test-key', isShared: false };
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = [];
  mocks.auth.mockResolvedValue({ user: { id: '1', role: 'host' } });
  mocks.endpoint.mockResolvedValue({ valid: true }); mocks.encrypt.mockReturnValue('encrypted');
  mocks.insert.mockReturnValue({ values: vi.fn(async () => {}) });
});
it('rejects non-admin attempts to share a service', async () => {
  expect(await saveImageProvider(null, { ...config, isShared: true })).toEqual({ success: false, error: 'unauthorized' });
  expect(mocks.insert).not.toHaveBeenCalled();
});
it('rejects unauthenticated writes', async () => {
  mocks.auth.mockResolvedValue(null);
  expect(await saveImageProvider(null, config)).toEqual({ success: false, error: 'unauthorized' });
});
it('encrypts keys on personal service creation', async () => {
  expect(await saveImageProvider(null, config)).toEqual({ success: true });
  expect(mocks.encrypt).toHaveBeenCalledWith('private-test-key');
  expect(mocks.insert.mock.results[0].value.values).toHaveBeenCalledWith(expect.objectContaining({ apiKeyEncrypted: 'encrypted', apiKeyHint: '-key', isShared: false, ownerId: 1 }));
});
it('returns neither plaintext nor encrypted credentials in service listings', async () => {
  mocks.rows = [{ ...config, apiKey: undefined, id: 5, ownerId: 1, apiKeyEncrypted: 'ciphertext', apiKeyHint: '-key', settings: { size: '1024x1024' } }];
  const [row] = await getImageProviders();
  expect(row).not.toHaveProperty('apiKey'); expect(row).not.toHaveProperty('apiKeyEncrypted');
});
it('rejects another host’s private service at runtime, but accepts shared services', async () => {
  mocks.rows = [{ ...config, ownerId: 2, settings: { size: '1024x1024' } }];
  expect(await resolveImageProvider(5, 1)).toBeNull();
  mocks.rows = [{ ...config, ownerId: 2, isShared: true, settings: { size: '1024x1024' } }];
  expect(await resolveImageProvider(5, 1)).not.toBeNull();
});
it('allows disabling imageGen after its service has been deleted', async () => {
  expect(await validImageAssignment(42, 5, false)).toBe(true);
  expect(await validImageAssignment(42, undefined, true)).toBe(false);
});
