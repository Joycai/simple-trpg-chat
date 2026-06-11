"use server";

import { db, sqlBool } from "@/db";
import { users, roomMembers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
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

  // 1. Create a "Shadow User" for the bot
  const botUsername = `bot_${crypto.randomBytes(4).toString("hex")}`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

  const [botUser] = await db.insert(users).values({
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
  await db.insert(roomMembers).values({
    roomId,
    userId: botUser.id,
    nickname: data.nickname,
    avatarColor: data.avatarColor || getRandomColorForUser(botUser.id),
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
    .where(and(eq(roomMembers.roomId, roomId), sql`${users.isBot} = ${sqlBool(true)}`));

  return results.map((r: any) => ({
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
  if (!botUser) throw new Error("Bot not found");
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

  await db.delete(roomMembers).where(
    and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, botUserId)
    )
  );

  await db.delete(users).where(eq(users.id, botUserId));

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * checkBotMentionAction (UI helper)
 */
export async function checkBotMentionAction(roomId: number, content: string, senderUserId: number) {
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
