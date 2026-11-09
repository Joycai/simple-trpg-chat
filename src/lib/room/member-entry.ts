import "server-only";
import { db } from "@/db";
import { roomMembers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { broadcastToRoom } from "@/lib/server/events";
import { sanitizeBotConfigForClient } from "@/lib/ai/bot-status";
import { roomAvatarUrl } from "@/lib/media/avatars";
import type { RoomMemberEntry } from "./member-dto";

/**
 * The exact member shape the room page serializes to `RoomClient.players`
 * (see `rooms/[id]/page.tsx`): explicit columns only, `botConfigJson` reduced
 * to the client projection, and the avatar base64 replaced by its URL.
 * Single source for both the SSR payload and the live `member_joined` event so
 * an incrementally-added row matches the seeded ones field for field.
 */
export async function memberEntry(roomId: number, userId: number): Promise<RoomMemberEntry | null> {
  const [row] = await db
    .select({
      room_members: {
        id: roomMembers.id,
        roomId: roomMembers.roomId,
        userId: roomMembers.userId,
        nickname: roomMembers.nickname,
        joinedAt: roomMembers.joinedAt,
        characterData: roomMembers.characterData,
        avatarColor: roomMembers.avatarColor,
        avatar: roomMembers.avatar,
      },
      users: {
        id: users.id,
        isBot: users.isBot,
        displayName: users.displayName,
        username: users.username,
        botConfigJson: users.botConfigJson,
      },
    })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  if (!row) return null;

  const rm = row.room_members;
  return {
    room_members: {
      ...rm,
      avatar: rm.avatar ? roomAvatarUrl(roomId, rm.userId, rm.avatar) : null,
    },
    users: { ...row.users, botConfigJson: sanitizeBotConfigForClient(row.users.botConfigJson) },
  };
}

/** Broadcast the new member to already-connected clients (join flow). */
export async function broadcastMemberJoined(roomId: number, userId: number): Promise<void> {
  const player = await memberEntry(roomId, userId);
  if (!player) return;
  broadcastToRoom(roomId, { type: "member_joined", player });
}
