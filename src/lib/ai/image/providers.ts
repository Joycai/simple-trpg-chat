import 'server-only';
import { db } from '@/db';
import { imageProviders, rooms } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ImageProviderInput } from './config';

export async function resolveImageProvider(id: number, hostId: number) {
  const [row] = await db.select().from(imageProviders).where(eq(imageProviders.id, id));
  if (!row || (!row.isShared && row.ownerId !== hostId)) return null;
  const config = ImageProviderInput.safeParse({ ...row, ...(row.settings as object) });
  return config.success ? { row, config: config.data } : null;
}
export async function validImageAssignment(roomId: number, id: number | undefined, enabled: boolean) {
  if (!enabled) return true;
  if (!Number.isSafeInteger(id) || !id || id < 1) return false;
  const [room] = await db.select({ hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, roomId));
  return !!room && !!(await resolveImageProvider(id, room.hostId));
}
