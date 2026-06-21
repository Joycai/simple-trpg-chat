"use server";

import { db } from "@/db";
import { users, roomMembers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getRandomColorForUser } from "@/lib/avatar-colors";
import { broadcastToRoom } from "@/lib/events";

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
) {
  // Only room hosts can create bots in the room
  await checkRoomAccess(roomId, true);

  // 1. Create a "Shadow User" for the bot (atomic transaction)
  const botUsername = `bot_${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = "is_bot"; // Bots never log in directly; avoid expensive bcrypt hash

  const botUser = await db.transaction(async (tx) => {
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
        enableTools: data.enableTools || ["send_message", "roll_dice"],
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
    });

    return userRecord;
  });

  revalidatePath(`/rooms/${roomId}`);
  return botUser;
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
) {
  // Only room hosts can edit bots
  await checkRoomAccess(roomId, true);

  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser || !botUser.isBot) throw new Error("Bot not found");

  // Verify the bot is actually a member of this room
  const [botMember] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));
  if (!botMember) throw new Error("Bot is not a member of this room");
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
}

/**
 * deleteBotAction
 * Removes a bot user record.
 */
export async function deleteBotAction(roomId: number, botUserId: number) {
  // Only room hosts can delete bots
  await checkRoomAccess(roomId, true);

  // Verify the bot is a member of this room and is actually a bot
  const [botUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, botUserId));
  if (!botUser || !botUser.isBot) throw new Error("Bot not found");

  const [botMember] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));
  if (!botMember) throw new Error("Bot is not a member of this room");

  // Deleting the shadow user cascades automatically to delete room membership
  await db.delete(users).where(eq(users.id, botUserId));

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * checkBotMentionAction (UI helper)
 */
export async function checkBotMentionAction(roomId: number, content: string, _senderUserId: number) {
  const bots = await getRoomBotsAction(roomId);
  for (const bot of bots) {
    if (content.includes(`@${bot.nickname}`)) {
      return { isMention: true, botId: bot.id, nickname: bot.nickname, config: bot.config };
    }
  }
  return { isMention: false };
}

/**
 * Manually trigger a bot to respond in the room.
 * Only the Host can trigger bots manually.
 */
export async function triggerBotAction(roomId: number, botUserId: number) {
  // Only room hosts can manually trigger bots
  const { userId } = await checkRoomAccess(roomId, true);

  // Async trigger — bot responds in the background
  import("@/lib/ai_agent").then(({ runAgent }) => runAgent(botUserId, roomId, { triggeringUserId: userId, isPrivate: false })).catch(console.error);

  return { success: true };
}
