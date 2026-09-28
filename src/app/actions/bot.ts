"use server";

import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import { emptySheet } from "@/lib/character/sheet-v2";
import { db } from "@/db";
import { users, roomMembers, rooms } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { checkRoomAccess, tryRoomAccess } from "@/lib/auth/room-access";
import { getTranslations } from "next-intl/server";
import { getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { broadcastToRoom } from "@/lib/server/events";
import { getRuleForRoom } from "@/lib/rules";
import type { Fail } from "@/lib/actions/result";
import { noRoomAccess } from "@/lib/actions/no-room-access";

/**
 * createBotAction
 * Creates a new AI Bot for a specific room.
 */
export async function createBotAction(
  roomId: number,
  data: {
    name: string;
    nickname: string;
    systemPrompt: string;
    model: string;
    activation: string;
    enableTools?: string[];
    providerId?: number;
    avatarColor?: string;
  }
): Promise<{ success: true } | Fail> {
  // Only room hosts can create bots in the room
  if (!(await tryRoomAccess(roomId, true))) {
    return noRoomAccess();
  }

  // 1. Create a "Shadow User" for the bot (atomic transaction)
  const botUsername = `bot_${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = "is_bot"; // Bots never log in directly; avoid expensive bcrypt hash

  const [room] = await db.select({ ruleTemplate: rooms.ruleTemplate })
    .from(rooms)
    .where(eq(rooms.id, roomId));

  const botUserId = await db.transaction(async (tx) => {
    const [userRecord] = await tx.insert(users).values({
      username: botUsername,
      passwordHash,
      displayName: data.name,
      isBot: true,
      botConfigJson: JSON.stringify({
        roomId,
        systemPrompt: data.systemPrompt,
        model: data.model,
        activation: data.activation,
        enableTools: data.enableTools || ["roll_dice", "respond_check"],
        providerId: data.providerId,
        historicalSummary: "",
        lastSummarizedMsgId: 0
      }),
    }).returning();

    // 2. Add the bot to the room members
    await tx.insert(roomMembers).values({
      roomId,
      userId: userRecord.id,
      nickname: data.nickname,
      avatarColor: data.avatarColor || getRandomColorForUser(userRecord.id),
      // Bots are members too — the AI sheet tools expect a rule-shaped card.
      characterData: JSON.stringify(emptySheet(getRuleForRoom(room || {}).id)),
    });
    return userRecord.id;
  });
  // The host's completion badges count the new bot right away.
  await broadcastCharacterUpdate(roomId, botUserId);

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * getRoomBotsAction
 * Lists all bots in a room.
 */
export async function getRoomBotsAction(roomId: number) {
  // Verify that the user is at least a member of the room to list bots
  await checkRoomAccess(roomId, false);

  const results = await db
    .select()
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), sql`${users.isBot} = ${true}`));

  return results.map((r: { users: { id: number; displayName: string | null; botConfigJson: string | null }; room_members: { id: number; nickname: string; avatarColor: string | null } }) => ({
    id: r.users.id,
    memberId: r.room_members.id,
    nickname: r.room_members.nickname,
    name: r.users.displayName,
    config: JSON.parse(r.users.botConfigJson || "{}"),
    avatarColor: r.room_members.avatarColor,
  }));
}

/**
 * updateBotAction
 * Update existing bot config.
 */
export async function updateBotAction(
  roomId: number,
  botUserId: number,
  data: { name: string; nickname: string; systemPrompt: string; model: string; activation: string; enableTools?: string[]; providerId?: number; avatarColor?: string }
): Promise<{ success: true } | Fail> {
  // Only room hosts can edit bots
  if (!(await tryRoomAccess(roomId, true))) {
    return noRoomAccess();
  }
  const t = await getTranslations("bots");

  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser || !botUser.isBot) return { success: false, error: t("errorBotNotFound") };

  // Verify the bot is actually a member of this room
  const [botMember] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));
  if (!botMember) return { success: false, error: t("errorBotNotMember") };
  const existingConfig = JSON.parse(botUser.botConfigJson || "{}");

  await db.update(users).set({
    displayName: data.name,
    botConfigJson: JSON.stringify({ ...existingConfig, systemPrompt: data.systemPrompt, model: data.model, activation: data.activation, enableTools: data.enableTools || existingConfig.enableTools, providerId: data.providerId }),
  }).where(eq(users.id, botUserId));

  await db.update(roomMembers).set({
    nickname: data.nickname,
    avatarColor: data.avatarColor,
  }).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * Manually trigger a bot to respond in the room.
 * Only the Host can trigger bots manually.
 */
export async function triggerBotAction(roomId: number, botUserId: number): Promise<{ success: true } | Fail> {
  // Only room hosts can manually trigger bots
  const access = await tryRoomAccess(roomId, true);
  if (!access) return noRoomAccess();
  const { userId } = access;

  // Async trigger — bot responds in the background
  import("@/lib/ai/agent").then(({ runAgent }) => runAgent(botUserId, roomId, { triggeringUserId: userId, isPrivate: false, bypassCooldown: true })).catch(console.error);

  return { success: true };
}
