'use server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/db';
import { assetSessions, generatedAssets, imageGenerations, imageProviders, users, aiPointLogs, roomMembers } from '@/db/schema';
import { and, eq, or, desc, sql, inArray, gt } from 'drizzle-orm';
import { tryRoomAccess, checkRoomAccess } from '@/lib/auth/room-access';
import { getTranslations } from 'next-intl/server';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { resolveImageProvider } from '@/lib/ai/image/providers';
import { ImageProviderInput } from '@/lib/ai/image/config';
import { AssetKind, Submission, ASSET_LIMIT, assetUrl, type StudioState } from '@/lib/ai/assets/types';
import { assetJobAllowed, serviceQuote, type AssetJob } from '@/lib/ai/assets/jobs';
import { retainAsset, availableAsset } from '@/lib/ai/assets/storage';
import { parseAvatarDataUrl, roomAvatarUrl } from '@/lib/media/avatars';
import { broadcastToRoom } from '@/lib/server/events';
import type { Done, Fail } from '@/lib/actions/result';

export async function loadAssetStudio(roomId: number, kindInput: unknown, sessionId?: string): Promise<StudioState> {
  const kind = AssetKind.parse(kindInput);
  const { userId } = await checkRoomAccess(roomId, kind !== 'portrait');
  const allowed = await assetJobAllowed({ roomId, userId, kind });
  const [user] = await db.select({ aiPoints: users.aiPoints, role: users.role }).from(users).where(eq(users.id, userId));
  const providers = allowed ? await db.select().from(imageProviders).where(or(eq(imageProviders.ownerId, userId), eq(imageProviders.isShared, true))) : [];
  const services = providers.flatMap(row => {
    const parsed = ImageProviderInput.safeParse({ ...row, ...(row.settings as object) });
    return parsed.success ? [{ id: row.id, name: row.name, model: row.model, size: parsed.data.size,
      shared: row.isShared, points: row.isShared && user.role !== 'admin' ? row.ratePerImage : 0,
      quote: serviceQuote(parsed.data, row.isShared, row.isShared && user.role !== 'admin' ? row.ratePerImage : 0) }] : [];
  });
  const sessions = await db.select({ id: assetSessions.id, targetKey: assetSessions.targetKey, prompt: assetSessions.prompt, createdAt: assetSessions.createdAt }).from(assetSessions)
    .where(and(eq(assetSessions.ownerId, userId), eq(assetSessions.roomId, roomId), eq(assetSessions.kind, kind))).orderBy(desc(assetSessions.createdAt)).limit(30);
  // Never query an arbitrary session without owner/room scoping, even if it is outside recent 30.
  const [selected] = sessionId ? await db.select().from(assetSessions).where(and(eq(assetSessions.id, sessionId), eq(assetSessions.ownerId, userId), eq(assetSessions.roomId, roomId), eq(assetSessions.kind, kind))) : [];
  const assets = selected ? await db.select().from(generatedAssets).where(and(eq(generatedAssets.sessionId, selected.id), eq(generatedAssets.hidden, false), availableAsset())).orderBy(generatedAssets.createdAt) : [];
  const tasks = selected ? await db.select({ id: imageGenerations.id, status: imageGenerations.status, points: imageGenerations.reservedPoints, createdAt: imageGenerations.createdAt })
    .from(imageGenerations).where(and(eq(imageGenerations.userId, userId), eq(imageGenerations.roomId, roomId), sql`${imageGenerations.snapshot}->>'sessionId' = ${selected.id}`)).orderBy(desc(imageGenerations.createdAt)).limit(20) : [];
  const [member] = await db.select({ portraitUrl: roomMembers.portraitUrl }).from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  return { services, balance: Number(user.aiPoints), sessions, assets: assets.map(a => ({ id: a.id, url: assetUrl(a.id), prompt: a.prompt, createdAt: a.createdAt, expiresAt: a.expiresAt, retained: a.retained })), tasks, portraitUrl: member?.portraitUrl ?? null };
}
export async function createAssetSession(roomId: number, input: unknown): Promise<{ success: true; id: string } | Fail> {
  const t = await getTranslations('assetStudio');
  const parsed = z.object({ kind: AssetKind, targetKey: z.string().min(1).max(100), prompt: z.string().max(8000) }).safeParse(input);
  if (!parsed.success) return { success: false, error: t('invalid') };
  const { kind, targetKey, prompt } = parsed.data;
  const access = await tryRoomAccess(roomId, kind !== 'portrait', { requireWritable: true });
  if (!access || !(await assetJobAllowed({ roomId, userId: access.userId, kind }))) return { success: false, error: t('unavailable') };
  try {
    const id = randomUUID();
    await db.insert(assetSessions).values({ id, ownerId: access.userId, roomId, kind, targetKey, prompt });
    return { success: true, id };
  } catch { return { success: false, error: t('error') }; }
}
export async function submitAssetGeneration(roomId: number, input: unknown): Promise<Done> {
  const t = await getTranslations('assetStudio');
  const parsed = Submission.safeParse(input);
  if (!parsed.success) return { success: false, error: t('invalid') };
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return { success: false, error: t('unavailable') };
  const data = parsed.data;
  try {
    const [session] = await db.select().from(assetSessions).where(and(eq(assetSessions.id, data.sessionId), eq(assetSessions.ownerId, access.userId), eq(assetSessions.roomId, roomId)));
    if (!session || !(await assetJobAllowed({ roomId, userId: access.userId, kind: AssetKind.parse(session.kind) }))) return { success: false, error: t('unavailable') };
    const provider = await resolveImageProvider(data.providerId, access.userId);
    if (!provider) return { success: false, error: t('unavailable') };
    const job: AssetJob = { purpose: 'user_asset', sessionId: session.id, userId: access.userId, roomId,
      kind: AssetKind.parse(session.kind), providerId: provider.row.id, config: provider.config,
      key: decrypt(provider.row.apiKeyEncrypted), prompt: data.prompt };
    const result = await db.transaction(async tx => {
      // One lock serializes idempotency, user-wide concurrency, rate and balance checks.
      const [user] = await tx.select().from(users).where(eq(users.id, access.userId)).for('update');
      const [existing] = await tx.select().from(imageGenerations).where(eq(imageGenerations.id, data.requestId));
      if (existing) return existing.userId === user.id && (existing.snapshot as { sessionId?: string }).sessionId === session.id ? null : 'invalid';
      const points = provider.row.isShared && user.role !== 'admin' ? provider.config.ratePerImage : 0;
      if (data.quote !== serviceQuote(provider.config, provider.row.isShared, points)) return 'quoteChanged';
      const pending = await tx.select({ id: imageGenerations.id }).from(imageGenerations).where(and(eq(imageGenerations.userId, user.id), inArray(imageGenerations.status, ['queued', 'pending', 'generated']), sql`${imageGenerations.snapshot}->>'purpose' = 'user_asset'`));
      if (pending.length) return 'busy';
      const recent = await tx.select({ id: imageGenerations.id }).from(imageGenerations).where(and(eq(imageGenerations.userId, user.id), gt(imageGenerations.createdAt, new Date(Date.now() - 60000).toISOString()), sql`${imageGenerations.snapshot}->>'purpose' = 'user_asset'`));
      if (recent.length >= 3) return 'rateLimit';
      const candidates = await tx.select({ id: generatedAssets.id }).from(generatedAssets).where(and(eq(generatedAssets.sessionId, session.id), eq(generatedAssets.hidden, false), availableAsset()));
      if (candidates.length >= ASSET_LIMIT) return 'limit';
      if (Number(user.aiPoints) < points) return 'insufficient';
      await tx.insert(imageGenerations).values({ id: data.requestId, userId: user.id, roomId, providerId: provider.row.id,
        status: 'queued', requestEncrypted: encrypt(JSON.stringify(job)), reservedPoints: points,
        snapshot: { purpose: 'user_asset', sessionId: session.id, name: provider.row.name, model: provider.config.model, size: provider.config.size, protocol: provider.config.protocol, quality: provider.config.quality, aspectRatio: provider.config.aspectRatio, watermark: provider.config.watermark, chargedPoints: points, payerRole: user.role, ratePerImage: provider.config.ratePerImage, isShared: provider.row.isShared } });
      await tx.update(assetSessions).set({ prompt: data.draftPrompt }).where(eq(assetSessions.id, session.id));
      if (points > 0) {
        const after = Number((Number(user.aiPoints) - points).toFixed(10));
        await tx.update(users).set({ aiPoints: after }).where(eq(users.id, user.id));
        await tx.insert(aiPointLogs).values({ userId: user.id, amount: -points, beforePoints: user.aiPoints, afterPoints: after, type: 'usage', description: `Asset reservation (${data.requestId})` });
      }
      return null;
    });
    if (result) return { success: false, error: t(result) };
    void import('@/lib/ai/image/worker').then(m => m.startImageWorker()).catch(() => {});
    return { success: true };
  } catch { return { success: false, error: t('error') }; }
}
export async function deleteAssetCandidate(roomId: number, id: string): Promise<Done> {
  const t = await getTranslations('assetStudio');
  const access = await tryRoomAccess(roomId);
  if (!access) return { success: false, error: t('unavailable') };
  try {
    await db.update(generatedAssets).set({ hidden: true }).where(and(eq(generatedAssets.id, id), eq(generatedAssets.ownerId, access.userId), eq(generatedAssets.roomId, roomId)));
    return { success: true };
  } catch { return { success: false, error: t('error') }; }
}
export async function saveGeneratedPortrait(roomId: number, id: string, avatar: string): Promise<Done> {
  const t = await getTranslations('assetStudio');
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access || !parseAvatarDataUrl(avatar).ok) return { success: false, error: t('invalid') };
  try {
    await db.transaction(async tx => {
      const [member] = await tx.select({ id: roomMembers.id }).from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, access.userId))).for('update');
      const [asset] = await tx.select().from(generatedAssets).where(and(eq(generatedAssets.id, id), eq(generatedAssets.ownerId, access.userId), eq(generatedAssets.roomId, roomId)));
      if (!member || !asset) throw new Error('Unavailable');
      await retainAsset(tx, assetUrl(id), roomId, access.userId);
      await tx.update(roomMembers).set({ avatar, portraitUrl: assetUrl(id) }).where(eq(roomMembers.id, member.id));
    });
    broadcastToRoom(roomId, { type: 'member_updated', userId: access.userId, avatar: roomAvatarUrl(roomId, access.userId, avatar) });
    return { success: true };
  } catch { return { success: false, error: t('error') }; }
}
