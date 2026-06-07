"use server";

import { db } from "@/db";
import { users, roomMembers, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "crypto";

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
  }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Unauthorized: Only hosts can create bots");
  }

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
      historicalSummary: "",
      lastSummarizedMsgId: 0
    }),
  }).returning();

  // 2. Add the bot to the room members
  await db.insert(roomMembers).values({
    roomId,
    userId: botUser.id,
    nickname: data.nickname,
  });

  revalidatePath(`/rooms/${roomId}`);
  return botUser;
}

/**
 * getRoomBotsAction
 * Lists all bots in a room.
 */
export async function getRoomBotsAction(roomId: number) {
  const results = await db
    .select()
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), eq(users.isBot, true)));

  return results.map(r => ({
    id: r.users.id,
    memberId: r.room_members.id,
    nickname: r.room_members.nickname,
    name: r.users.displayName,
    config: JSON.parse(r.users.botConfigJson || "{}"),
  }));
}

/**
 * updateBotAction
 * Update existing bot config.
 */
export async function updateBotAction(
  roomId: number,
  botUserId: number,
  data: { name: string; nickname: string; systemPrompt: string; model: string; activation: string }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") throw new Error("Unauthorized");

  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser) throw new Error("Bot not found");
  const existingConfig = JSON.parse(botUser.botConfigJson || "{}");

  await db.update(users).set({
    displayName: data.name,
    botConfigJson: JSON.stringify({ ...existingConfig, systemPrompt: data.systemPrompt, model: data.model, activation: data.activation }),
  }).where(eq(users.id, botUserId));

  await db.update(roomMembers).set({ nickname: data.nickname })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * deleteBotAction
 * Removes a bot user record.
 */
export async function deleteBotAction(roomId: number, botUserId: number) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Unauthorized");
  }

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
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Unauthorized: Only hosts can trigger bots manually");
  }

  // Async trigger — bot responds in the background
  import("@/lib/ai_agent").then(({ runAgent }) => runAgent(botUserId, roomId)).catch(console.error);

  return { success: true };
}
