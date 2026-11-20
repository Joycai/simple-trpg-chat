'use server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/db';
import { imageProviders, imageGenerations, rooms, users } from '@/db/schema';
import { and, eq, or, desc } from 'drizzle-orm';
import { encrypt } from '@/lib/security/encryption';
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { ImageProviderInput, type ImageProviderView } from '@/lib/ai/image/config';
import { checkRoomAccess } from '@/lib/auth/room-access';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { Done } from '@/lib/actions/result';

const sharedImageAdminSchema = z.object({
  isShared: z.boolean(),
  ratePerImage: z.number().finite().min(0).max(1000000),
}).strict();

export async function getImageProviders(roomId?: number): Promise<ImageProviderView[]> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  const userId = Number(session.user.id);
  const isAdmin = session.user.role === 'admin';
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
    const isOwner = row.ownerId === userId;
    return [{ ...publicConfig, id: row.id, isOwner, canManage: isOwner || (isAdmin && row.isShared), apiKeyHint: isOwner ? row.apiKeyHint : '' }];
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
    // Strictly owner-only: prevents another admin from redirecting an owner's stored API key to a different endpoint.
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
    revalidatePath('/admin/ai');
    return { success: true };
  } catch { return { success: false, error: t('failed') }; }
}
/** Allow any admin to adjust sharing/rate on a shared image service without touching its endpoint or credentials. */
export async function updateSharedImageProviderAdmin(id: number, input: unknown): Promise<Done> {
  const t = await getTranslations('imageGeneration');
  const session = await auth();
  if (!session || session.user.role !== 'admin') return { success: false, error: t('unauthorized') };
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: t('invalid') };
  const parsed = sharedImageAdminSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: t('invalid') };
  const userId = Number(session.user.id);
  try {
    const rows = await db
      .update(imageProviders)
      .set({ isShared: parsed.data.isShared, ratePerImage: parsed.data.ratePerImage })
      .where(and(eq(imageProviders.id, id), or(eq(imageProviders.ownerId, userId), eq(imageProviders.isShared, true))))
      .returning({ id: imageProviders.id });
    if (!rows.length) return { success: false, error: t('unauthorized') };
    revalidatePath('/admin/ai');
    return { success: true };
  } catch { return { success: false, error: t('failed') }; }
}
export async function deleteImageProvider(id: number): Promise<Done> {
  const t = await getTranslations('imageGeneration');
  const session = await auth();
  if (!session) return { success: false, error: t('unauthorized') };
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: t('invalid') };
  const userId = Number(session.user.id);
  const isAdmin = session.user.role === 'admin';
  try {
    const condition = isAdmin
      ? and(eq(imageProviders.id, id), or(eq(imageProviders.ownerId, userId), eq(imageProviders.isShared, true)))
      : and(eq(imageProviders.id, id), eq(imageProviders.ownerId, userId));
    const rows = await db.delete(imageProviders).where(condition).returning({ id: imageProviders.id });
    if (!rows.length) return { success: false, error: t('unauthorized') };
    revalidatePath('/admin/ai');
    return { success: true };
  } catch { return { success: false, error: t('failed') }; }
}
export async function getMyImageUsage() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  return db.select({ id: imageGenerations.id, createdAt: imageGenerations.createdAt, status: imageGenerations.status, imageCount: imageGenerations.imageCount, points: imageGenerations.reservedPoints })
    .from(imageGenerations).where(eq(imageGenerations.userId, Number(session.user.id))).orderBy(desc(imageGenerations.createdAt)).limit(30);
}
export async function getAdminImageUsage() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') throw new Error('Unauthorized');
  const rows = await db
    .select({
      id: imageGenerations.id,
      createdAt: imageGenerations.createdAt,
      status: imageGenerations.status,
      imageCount: imageGenerations.imageCount,
      points: imageGenerations.reservedPoints,
      userName: users.displayName,
      snapshot: imageGenerations.snapshot,
    })
    .from(imageGenerations)
    .leftJoin(users, eq(imageGenerations.userId, users.id))
    .orderBy(desc(imageGenerations.createdAt))
    .limit(30);
  return rows.map(row => {
    const snap = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot as { name?: unknown } : {};
    return {
      id: row.id,
      createdAt: row.createdAt,
      status: row.status,
      imageCount: row.imageCount,
      points: row.points,
      userName: row.userName ?? '—',
      providerName: typeof snap.name === 'string' ? snap.name : '—',
    };
  });
}
