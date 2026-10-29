import 'server-only';
import { db } from '@/db';
import { rooms, roomMembers, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/** Recheck durable job recipients before generating and before exposing an artifact. */
export async function imageJobAllowed(ctx: { roomId: number; botUserId: number; hostId: number; replyIsPrivate: boolean; targetUserId: number | null }) {
  const [bot] = await db.select({ id: users.id }).from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId)).innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(rooms.id, ctx.roomId), eq(rooms.hostId, ctx.hostId), eq(users.id, ctx.botUserId), eq(users.isBot, true)));
  if (!bot) return false;
  if (!ctx.replyIsPrivate) return true;
  if (!ctx.targetUserId) return false;
  const [target] = await db.select({ id: roomMembers.id }).from(roomMembers)
    .where(and(eq(roomMembers.roomId, ctx.roomId), eq(roomMembers.userId, ctx.targetUserId)));
  return !!target;
}
