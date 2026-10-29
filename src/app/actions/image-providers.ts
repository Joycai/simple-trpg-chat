'use server';
import { auth } from '@/auth';
import { db } from '@/db';
import { imageProviders, imageGenerations, rooms } from '@/db/schema';
import { and, eq, or, desc } from 'drizzle-orm';
import { encrypt } from '@/lib/security/encryption';
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { ImageProviderInput, type ImageProviderView } from '@/lib/ai/image/config';
import { checkRoomAccess } from '@/lib/auth/room-access';
import { getTranslations } from 'next-intl/server';
import type { Done } from '@/lib/actions/result';

export async function getImageProviders(roomId?: number): Promise<ImageProviderView[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const userId = Number(session.user.id);
  let ownerId = userId;
  if (roomId !== undefined) {
    await checkRoomAccess(roomId, true);
    const [room] = await db.select({ hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, roomId));
    if (!room) throw new Error('Room not found');
    ownerId = room.hostId;
  }
  const rows = await db.select().from(imageProviders).where(or(eq(imageProviders.ownerId, ownerId), eq(imageProviders.isShared, true))).orderBy(imageProviders.name);
  return rows.flatMap(row => {
    const parsed = ImageProviderInput.safeParse({ ...row, ...(row.settings as object) });
    if (!parsed.success) return [];
    const publicConfig = { ...parsed.data };
    delete publicConfig.apiKey;
    return [{ ...publicConfig, id: row.id, isOwner: row.ownerId === userId, apiKeyHint: row.ownerId === userId ? row.apiKeyHint : '' }];
  });
}
export async function saveImageProvider(id: number | null, input: unknown): Promise<Done> {
  const t = await getTranslations('imageGeneration');
  const session = await auth();
  if (!session) return { success: false, error: t('unauthorized') };
  const parsed = ImageProviderInput.safeParse(input);
  if (!parsed.success || (id !== null && (!Number.isSafeInteger(id) || id <= 0))) return { success: false, error: t('invalid') };
  const data = parsed.data;
  const ownerId = Number(session.user.id);
  if (data.isShared && session.user.role !== 'admin') return { success: false, error: t('unauthorized') };
  try {
    const [existing] = id ? await db.select().from(imageProviders).where(and(eq(imageProviders.id, id), eq(imageProviders.ownerId, ownerId))) : [];
    if (id && !existing) return { success: false, error: t('unauthorized') };
    if (!data.apiKey && !existing) return { success: false, error: t('keyRequired') };
    if (!(await validateApiEndpoint(data.apiEndpoint)).valid) return { success: false, error: t('invalidEndpoint') };
    const values = {
      ownerId, name: data.name, modelType: data.modelType, model: data.model, protocol: data.protocol,
      apiEndpoint: data.apiEndpoint.replace(/\/+$/, ''),
      apiKeyEncrypted: data.apiKey ? encrypt(data.apiKey) : existing!.apiKeyEncrypted,
      apiKeyHint: data.apiKey ? data.apiKey.slice(-4) : existing!.apiKeyHint,
      settings: { size: data.size, quality: data.quality, aspectRatio: data.aspectRatio, watermark: data.watermark },
      ratePerImage: data.ratePerImage, isShared: data.isShared,
    };
    if (id) await db.update(imageProviders).set(values).where(and(eq(imageProviders.id, id), eq(imageProviders.ownerId, ownerId)));
    else await db.insert(imageProviders).values(values);
    return { success: true };
  } catch { return { success: false, error: t('failed') }; }
}
export async function deleteImageProvider(id: number): Promise<Done> {
  const t = await getTranslations('imageGeneration');
  const session = await auth();
  if (!session) return { success: false, error: t('unauthorized') };
  try {
    const rows = await db.delete(imageProviders).where(and(eq(imageProviders.id, id), eq(imageProviders.ownerId, Number(session.user.id)))).returning({ id: imageProviders.id });
    return rows.length ? { success: true } : { success: false, error: t('unauthorized') };
  } catch { return { success: false, error: t('failed') }; }
}
export async function getMyImageUsage() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  return db.select({ id: imageGenerations.id, createdAt: imageGenerations.createdAt, status: imageGenerations.status, imageCount: imageGenerations.imageCount, points: imageGenerations.reservedPoints })
    .from(imageGenerations).where(eq(imageGenerations.userId, Number(session.user.id))).orderBy(desc(imageGenerations.createdAt)).limit(30);
}
