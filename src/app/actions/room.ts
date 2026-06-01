"use server";

import { db } from "@/db";
import { rooms, roomMembers, messages, users, roomSkills, type Theme, type DiceRules } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/events";
import { executeCommand } from "@/lib/commands";

// --- Room Actions ---

export async function createRoomAction(formData: FormData) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Only hosts can create rooms");
  }

  const name = formData.get("name") as string;
  const customKey = formData.get("key") as string;
  const theme = (formData.get("theme") as Theme) || "default";
  const diceRules = (formData.get("diceRules") as DiceRules) || "basic";

  if (!name || !name.trim()) throw new Error("Room name is required");

  // Use custom key if provided, otherwise generate one
  const secretKey = (customKey && customKey.trim())
    ? customKey.trim()
    : crypto.randomBytes(4).toString("hex");

  const [newRoom] = await db.insert(rooms).values({
    name: name.trim(),
    hostId: parseInt((session.user as any).id),
    secretKey,
    theme,
    diceRules,
  }).returning();

  // Host automatically joins
  await db.insert(roomMembers).values({
    roomId: newRoom.id,
    userId: parseInt((session.user as any).id),
    nickname: (session.user as any).name || "Host",
  });

  revalidatePath("/");
  return { roomId: newRoom.id, secretKey };
}

export async function joinRoomAction(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const roomId = parseInt(formData.get("roomId") as string);
  const key = (formData.get("key") as string)?.trim();

  if (!roomId || !key) throw new Error("Room ID and key are required");

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");
  if (room.secretKey !== key) throw new Error("Invalid key");

  const userId = parseInt((session.user as any).id);

  const [existing] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!existing) {
    await db.insert(roomMembers).values({
      roomId,
      userId,
      nickname: (session.user as any).name || "Player",
    });
  }

  revalidatePath("/");
}

// --- Nickname Action ---

export async function updateNicknameAction(roomId: number, nickname: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  await db.update(roomMembers)
    .set({ nickname })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  revalidatePath(`/rooms/${roomId}`);
}

// --- Message & Dice Actions ---

export async function sendMessageAction(
  roomId: number,
  content: string,
  type: "text" | "dice" | "system" = "text",
  diceDetail?: string,
  isPrivate: boolean = false,
  targetUserId?: number // V3.14: Added targetUserId
) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  // 1. Intercept for Bot Commands if it's a plain text message starting with '.'
  if (type === "text" && content.startsWith(".")) {
    const result = await executeCommand(roomId, userId, content);
    if (result.isCommand) {
      if (!result.success) {
        return await db.insert(messages).values({
          roomId,
          userId,
          nickname: "SYSTEM",
          content: `⚠️ 指令错误: ${result.error}`,
          type: "system",
          isPrivate: true,
        }).returning();
      }
      return result.message; 
    }
  }

  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member) throw new Error("Not a member");

  const [newMessage] = await db.insert(messages).values({
    roomId,
    userId,
    targetUserId,
    nickname: member.nickname,
    content,
    type,
    diceDetail: diceDetail || null,
    isPrivate,
  }).returning();

  broadcastToRoom(roomId, newMessage);
  return newMessage;
}

export async function rollDiceAction(roomId: number, faces: number, count: number, isPrivate: boolean = false) {
  const results = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
  const sum = results.reduce((a, b) => a + b, 0);
  const notation = `${count}d${faces}`;
  
  const detail = JSON.stringify({
    dice: `d${faces}`,
    count,
    results,
    sum,
    notation
  });

  const content = `🎲 ${notation}: [${results.join(", ")}] = ${sum}`;
  
  return await sendMessageAction(roomId, isPrivate ? `🔒 ${content}` : content, "dice", detail, isPrivate);
}

// --- Room Settings ---

export async function updateRoomSettingsAction(roomId: number, formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  // Verify host
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room || room.hostId !== userId) throw new Error("Only the host can change room settings");

  const theme = ((formData.get("theme") as string) || "default") as Theme;
  const diceRules = ((formData.get("diceRules") as string) || "basic") as DiceRules;

  await db.update(rooms).set({ theme, diceRules }).where(eq(rooms.id, roomId));
  revalidatePath(`/rooms/${roomId}`);
}

// --- Data Fetching ---

export async function getRoomMessages(roomId: number) {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt);
}

export async function getRoomSkills(roomId: number, userId: number) {
  return await db
    .select()
    .from(roomSkills)
    .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)))
    .orderBy(roomSkills.skillName);
}

// --- Command Engine ---

export async function executeCommandAction(roomId: number, userId: number, content: string) {
  const { executeCommand } = await import("@/lib/commands");
  return await executeCommand(roomId, userId, content);
}

export async function deleteSkillAction(roomId: number, userId: number, skillName: string) {
  await db.delete(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, skillName)
    )
  );
  revalidatePath(`/rooms/${roomId}`);
}

export async function upsertSkillAction(roomId: number, userId: number, skillName: string, skillValue: number) {
  await db.insert(roomSkills).values({
    roomId,
    userId,
    skillName,
    skillValue,
  }).onConflictDoUpdate({
    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
    set: { skillValue, updatedAt: sql`(datetime('now'))` },
  });
  revalidatePath(`/rooms/${roomId}`);
}
