import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { users, rooms, roomMembers, imageProviders, imageGenerations, generatedAssets, inventoryItems, inventoryDistributions, messages } from '@/db/schema';
const state = vi.hoisted(() => ({ userId: 0, request: vi.fn(), download: vi.fn() }));
vi.mock('@/db', async () => {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { readFileSync } = await import('node:fs');
  const schema = await import('@/db/schema');
  const isolated = `asset_test_${randomUUID().replaceAll('-', '')}`;
  const client = postgres(process.env.DATABASE_URL || JSON.parse(readFileSync('db.config.json', 'utf8')).url, { connection: { search_path: isolated }, max: 5 });
  await client.unsafe(`CREATE SCHEMA "${isolated}"`);
  for (const table of ['users', 'rooms', 'room_members', 'system_config', 'image_providers', 'image_generations', 'asset_sessions', 'generated_assets', 'ai_point_logs', 'inventory_items', 'inventory_distributions', 'messages']) {
    await client.unsafe(`CREATE TABLE "${isolated}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  await client`insert into system_config (key, value) values ('ai_enabled', 'true')`;
  return { db: drizzle(client, { schema }), cleanup: async () => { await client.unsafe(`DROP SCHEMA "${isolated}" CASCADE`); await client.end(); } };
});
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: String(state.userId), role: 'player' } }) }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/ai/image/worker', () => ({ startImageWorker: vi.fn() }));
vi.mock('@/lib/ai/image/transport', async original => ({ ...await original<typeof import('@/lib/ai/image/transport')>(), requestImage: state.request, downloadImage: state.download }));

// Real PostgreSQL transactions and access checks, fake upstream only. No paid requests.
describe.skipIf(process.env.TEST_RUNTIME_DATABASE !== '1')('asset studio PostgreSQL lifecycle', () => {
  let db: typeof import('@/db')['db'];
  let actions: typeof import('@/app/actions/asset-studio');
  let storage: typeof import('../storage');
  let jobs: typeof import('../jobs');
  let crypto: typeof import('@/lib/security/encryption');
  const ids: number[] = []; const files: string[] = [];
  let roomId: number; let providerId: number; let sessionId: string;
  let quote: string;
  const makeRequest = (extra = {}) => ({ sessionId, requestId: randomUUID(), providerId, quote, draftPrompt: 'A field investigator', prompt: 'A field investigator with a notebook', ...extra });
  beforeAll(async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'isolated-asset-test-key');
    db = (await import('@/db')).db;
    actions = await import('@/app/actions/asset-studio'); storage = await import('../storage'); jobs = await import('../jobs'); crypto = await import('@/lib/security/encryption');
    const members = await db.insert(users).values([0, 1, 2].map(i => ({ username: `asset-test-${randomUUID()}`, passwordHash: 'not-a-login', displayName: `Asset test ${i}`, aiPoints: 20 }))).returning();
    ids.push(...members.map(m => m.id));
    const [room] = await db.insert(rooms).values({ name: 'Asset isolated test', hostId: ids[0], secretKey: randomUUID() }).returning(); roomId = room.id;
    await db.insert(roomMembers).values(ids.map((userId, i) => ({ roomId, userId, nickname: `Asset ${i}` })));
    const [provider] = await db.insert(imageProviders).values({ ownerId: ids[0], name: 'Asset test provider', modelType: 'gpt-image-2', model: 'gpt-image-2', protocol: 'openai-images', apiEndpoint: 'https://api.openai.com/v1', apiKeyEncrypted: crypto.encrypt('unused-test-key'), apiKeyHint: 'test', settings: { size: '1024x1024', quality: 'auto', aspectRatio: '1:1', watermark: false }, ratePerImage: 2, isShared: true }).returning(); providerId = provider.id;
    state.userId = ids[1];
    const studio = await actions.loadAssetStudio(roomId, 'portrait'); quote = studio.services.find(s => s.id === providerId)!.quote;
    const session = await actions.createAssetSession(roomId, { kind: 'portrait', targetKey: 'test', prompt: '' });
    if (!session.success) throw new Error(session.error); sessionId = session.id;
    state.request.mockResolvedValue({ sources: [{ base64: 'unused' }], rawUsage: { images: 1 } });
    state.download.mockResolvedValue(await sharp({ create: { width: 32, height: 48, channels: 3, background: '#8899aa' } }).png().toBuffer());
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!db) return;
    const assets = roomId ? await db.select().from(generatedAssets).where(eq(generatedAssets.roomId, roomId)) : [];
    files.push(...assets.map(a => a.filename));
    await (await import('@/db') as unknown as { cleanup: () => Promise<void> }).cleanup();
    for (const file of files) await fs.rm(path.join(storage.ASSET_DIR, file), { force: true });
  });
  it('serializes duplicate requests, reserves caller points once and does not charge the host', async () => {
    const input = makeRequest();
    expect(await Promise.all([actions.submitAssetGeneration(roomId, input), actions.submitAssetGeneration(roomId, input)])).toEqual([{ success: true }, { success: true }]);
    const [caller] = await db.select().from(users).where(eq(users.id, ids[1]));
    const [host] = await db.select().from(users).where(eq(users.id, ids[0]));
    expect(Number(caller.aiPoints)).toBe(18); expect(Number(host.aiPoints)).toBe(20);
    expect(await actions.submitAssetGeneration(roomId, makeRequest())).toMatchObject({ success: false, error: 'busy' });
    const [row] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, input.requestId));
    expect(row.requestEncrypted).not.toContain('field investigator');
    const job = JSON.parse(crypto.decrypt(row.requestEncrypted!));
    await db.update(imageGenerations).set({ status: 'pending' }).where(eq(imageGenerations.id, row.id));
    await jobs.executeAssetJob(row.id, job);
    const ready = await actions.loadAssetStudio(roomId, 'portrait', sessionId);
    expect(ready.assets).toHaveLength(1); expect(ready.tasks[0].status).toBe('succeeded');
    expect(await db.select().from(messages).where(eq(messages.roomId, roomId))).toHaveLength(0);
    expect(state.request).toHaveBeenCalledOnce();
    expect(await storage.canReadAsset(ready.assets[0].id, ids[2])).toBeNull();
    state.userId = ids[2];
    expect((await actions.loadAssetStudio(roomId, 'portrait', sessionId)).assets).toEqual([]);
    expect(await actions.submitAssetGeneration(roomId, makeRequest())).toMatchObject({ success: false });
    state.userId = ids[1];
  });
  it('persists portrait and avatar together and protects a retained file after candidate removal', async () => {
    const ready = await actions.loadAssetStudio(roomId, 'portrait', sessionId);
    const asset = ready.assets[0];
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#8899aa' } }).jpeg().toBuffer();
    expect(await actions.saveGeneratedPortrait(roomId, asset.id, `data:image/jpeg;base64,${jpeg.toString('base64')}`)).toEqual({ success: true });
    expect(await storage.canReadAsset(asset.id, ids[2])).not.toBeNull();
    expect(await actions.deleteAssetCandidate(roomId, asset.id)).toEqual({ success: true });
    const [retained] = await db.select().from(generatedAssets).where(eq(generatedAssets.id, asset.id));
    expect(retained.retained).toBe(true); expect(retained.hidden).toBe(true);
    expect((await actions.loadAssetStudio(roomId, 'portrait', sessionId)).assets).toHaveLength(0);
    expect(await storage.canReadAsset(asset.id, ids[1])).not.toBeNull();
  });
  it('rejects stale quotes, foreign private services and non-host item creation', async () => {
    expect(await actions.submitAssetGeneration(roomId, makeRequest({ quote: 'stale' }))).toMatchObject({ success: false, error: 'quoteChanged' });
    expect(await actions.createAssetSession(roomId, { kind: 'clue', targetKey: 'test', prompt: '' })).toMatchObject({ success: false });
    await db.update(imageProviders).set({ isShared: false }).where(eq(imageProviders.id, providerId));
    expect(await actions.submitAssetGeneration(roomId, makeRequest())).toMatchObject({ success: false, error: 'unavailable' });
    await db.update(imageProviders).set({ isShared: true }).where(eq(imageProviders.id, providerId));
  });
  it('keeps paid timeouts unresolved without retries or claiming a refund', async () => {
    const input = makeRequest();
    expect(await actions.submitAssetGeneration(roomId, input)).toEqual({ success: true });
    const [row] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, input.requestId));
    await db.update(imageGenerations).set({ status: 'pending' }).where(eq(imageGenerations.id, row.id));
    state.request.mockRejectedValueOnce(new Error('timeout'));
    const before = state.request.mock.calls.length;
    await jobs.executeAssetJob(row.id, JSON.parse(crypto.decrypt(row.requestEncrypted!)));
    expect(state.request.mock.calls.length).toBe(before + 1);
    const [pending] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, row.id));
    expect(pending.status).toBe('pending'); expect(pending.reservedPoints).toBe(2);
  });
  it('does not expose retained but undistributed clue assets to room members', async () => {
    state.userId = ids[0];
    const result = await actions.createAssetSession(roomId, { kind: 'clue', targetKey: 'secret', prompt: 'a secret note' });
    if (!result.success) throw new Error(result.error);
    const request = makeRequest({ sessionId: result.id });
    expect(await actions.submitAssetGeneration(roomId, request)).toEqual({ success: true });
    const [row] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, request.requestId));
    await jobs.executeAssetJob(row.id, JSON.parse(crypto.decrypt(row.requestEncrypted!)));
    const ready = await actions.loadAssetStudio(roomId, 'clue', result.id); const asset = ready.assets[0];
    const [item] = await db.transaction(async tx => {
      await storage.retainAsset(tx, asset.url, roomId, ids[0]);
      return tx.insert(inventoryItems).values({ roomId, creatorId: ids[0], type: 'clue', title: 'Secret', contentJson: '{}', imageUrl: asset.url }).returning();
    });
    expect(await storage.canReadAsset(asset.id, ids[2])).toBeNull();
    await db.insert(inventoryDistributions).values({ roomId, itemId: item.id, fromUserId: ids[0], toUserId: ids[2] });
    expect(await storage.canReadAsset(asset.id, ids[2])).not.toBeNull();
  });
  it('rejects expired, unretained images at both read and save boundaries', async () => {
    const ready = await actions.loadAssetStudio(roomId, 'clue');
    const sid = ready.sessions[0].id;
    const candidate = (await actions.loadAssetStudio(roomId, 'clue', sid)).assets[0];
    await db.update(generatedAssets).set({ retained: false, expiresAt: new Date(0).toISOString() }).where(eq(generatedAssets.id, candidate.id));
    expect(await storage.canReadAsset(candidate.id, ids[0])).toBeNull();
    await expect(db.transaction(tx => storage.retainAsset(tx, candidate.url, roomId, ids[0]))).rejects.toThrow('Unavailable asset');
  });

  it('rejects an admin zero-price quote after demotion before reserving money', async () => {
    state.userId = ids[2];
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, ids[2]));
    const adminQuote = (await actions.loadAssetStudio(roomId, 'portrait')).services.find(s => s.id === providerId)!;
    expect(adminQuote.points).toBe(0);
    const session = await actions.createAssetSession(roomId, { kind: 'portrait', targetKey: 'demotion', prompt: '' });
    if (!session.success) throw new Error(session.error);
    await db.update(users).set({ role: 'player' }).where(eq(users.id, ids[2]));
    const input = makeRequest({ sessionId: session.id, quote: adminQuote.quote });
    expect(await actions.submitAssetGeneration(roomId, input)).toEqual({ success: false, error: 'quoteChanged' });
    expect(await db.select().from(imageGenerations).where(eq(imageGenerations.id, input.requestId))).toHaveLength(0);
    const [user] = await db.select().from(users).where(eq(users.id, ids[2]));
    expect(user.aiPoints).toBe(20);
  });
  it('refunds a definitely-unsent blocked request instead of holding points indefinitely', async () => {
    const { ImagePreflightError } = await import('@/lib/ai/image/transport');
    const session = await actions.createAssetSession(roomId, { kind: 'portrait', targetKey: 'blocked', prompt: '' });
    if (!session.success) throw new Error(session.error);
    const input = makeRequest({ sessionId: session.id });
    expect(await actions.submitAssetGeneration(roomId, input)).toEqual({ success: true });
    const [row] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, input.requestId));
    expect(row.snapshot).toMatchObject({ chargedPoints: 2, quality: 'auto', aspectRatio: '1:1', watermark: false });
    state.request.mockRejectedValueOnce(new ImagePreflightError('blocked'));
    await jobs.executeAssetJob(row.id, JSON.parse(crypto.decrypt(row.requestEncrypted!)));
    const [failed] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, row.id));
    expect(failed.status).toBe('failed'); expect(failed.reservedPoints).toBe(0);
    const [user] = await db.select().from(users).where(eq(users.id, ids[2]));
    expect(user.aiPoints).toBe(20);
  });

  it('refunds queued work without calling upstream when room membership is revoked', async () => {
    const session = await actions.createAssetSession(roomId, { kind: 'portrait', targetKey: 'revoked', prompt: '' });
    if (!session.success) throw new Error(session.error);
    const input = makeRequest({ sessionId: session.id });
    expect(await actions.submitAssetGeneration(roomId, input)).toEqual({ success: true });
    const [row] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, input.requestId));
    await db.delete(roomMembers).where(eq(roomMembers.userId, ids[2]));
    const calls = state.request.mock.calls.length;
    await jobs.executeAssetJob(row.id, JSON.parse(crypto.decrypt(row.requestEncrypted!)));
    expect(state.request.mock.calls.length).toBe(calls);
    const [failed] = await db.select().from(imageGenerations).where(eq(imageGenerations.id, row.id));
    expect(failed.status).toBe('failed'); expect(failed.reservedPoints).toBe(0);
    const [user] = await db.select().from(users).where(eq(users.id, ids[2]));
    expect(user.aiPoints).toBe(20);
  });

});
