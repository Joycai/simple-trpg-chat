"use server";

import { db, sqlNow, sqlBool } from "@/db";
import { rooms, roomMembers, messages, users, roomSkills, type Theme, type DiceRules, type RuleTemplate } from "@/db/schema";
import { eq, and, sql, inArray, or, desc, lt, isNull, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/events";
import { executeCommand } from "@/lib/commands";
import { rollDice } from "@/lib/utils";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { getTranslations } from "next-intl/server";

// --- Room Actions ---

export async function createRoomAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "host") {
      return { success: false, error: "Only hosts can create rooms" };
    }

    const name = formData.get("name") as string;
    const customKey = formData.get("key") as string;
    const theme = (formData.get("theme") as Theme) || "default";
    const diceRules = (formData.get("diceRules") as DiceRules) || "basic";
    const ruleTemplate = (formData.get("ruleTemplate") as RuleTemplate) || "basic";

    if (!name || !name.trim()) return { success: false, error: "Room name is required" };

    // Use custom key if provided, otherwise generate one
    const secretKey = (customKey && customKey.trim())
      ? customKey.trim()
      : crypto.randomBytes(4).toString("hex");

    const [newRoom] = await db.insert(rooms).values({
      name: name.trim(),
      hostId: parseInt(session.user.id),
      secretKey,
      theme,
      diceRules,
      ruleTemplate,
    }).returning();

    // Host automatically joins
    await db.insert(roomMembers).values({
      roomId: newRoom.id,
      userId: parseInt(session.user.id),
      nickname: session.user.name || "Host",
    });

    revalidatePath("/");
    return { success: true, roomId: newRoom.id, secretKey };
  } catch (err: any) {
    return { success: false, error: err.message || "An error occurred" };
  }
}

export async function joinRoomAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Not authenticated" };

    const roomId = parseInt(formData.get("roomId") as string);
    const key = (formData.get("key") as string)?.trim();

    if (!roomId || !key) return { success: false, error: "Room ID and key are required" };

    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) return { success: false, error: "Room not found" };
    if (room.secretKey !== key) return { success: false, error: "Invalid key" };

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
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "An error occurred" };
  }
}

// --- Nickname & Character Actions ---

export async function updateCharacterDataAction(roomId: number, characterData: any) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt((session.user as any).id);

  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  const existingData = member?.characterData ? JSON.parse(member.characterData) : {};
  const newData = { ...existingData, ...characterData };

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(newData) })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  revalidatePath(`/rooms/${roomId}`);
}

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
  const { userId, isHost } = await checkRoomAccess(roomId, false);

  const t = await getTranslations("roomActions");

  // 0. Scan for sensitive words
  if (type === "text") {
    const matchedWord = await checkSensitiveWords(content);
    if (matchedWord) {
      const [warningMsg] = await db.insert(messages).values({
        roomId,
        userId,
        targetUserId: userId, // Targeted strictly to the sender
        nickname: "SYSTEM",
        content: t("sensitiveWordsIntercepted"),
        type: "system",
        isPrivate: true,
      }).returning();

      broadcastToRoom(roomId, warningMsg);
      return warningMsg;
    }
  }

  // 1. Intercept for Bot Commands if it's a plain text message starting with '.'
  if (type === "text" && content.startsWith(".")) {
    const result = await executeCommand(roomId, userId, content);
    if (result.isCommand) {
      if (!result.success) {
        return await db.insert(messages).values({
          roomId,
          userId,
          nickname: "SYSTEM",
          content: t("commandError", { error: result.error || "" }),
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

  // --- AI Bot Activation Check ---
  const [senderUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, userId));
  if (type === "text" && !senderUser?.isBot) {
    if (isPrivate && targetUserId) {
      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
      if (targetUser && targetUser.isBot) {
        // Trigger Agent (async)
        import("@/lib/ai_agent").then(({ runAgent }) => runAgent(targetUserId, roomId));
      }
    } else if (!isPrivate) {
      // Check if any bot in the room is mentioned
      const roomBots = await db.query.roomMembers.findMany({
        where: eq(roomMembers.roomId, roomId),
        with: { user: true }
      });

      for (const m of roomBots) {
        if (m.user.isBot && (content.includes(`@${m.user.displayName}`) || content.includes(`@${m.nickname}`))) {
          // Trigger Agent (async)
          import("@/lib/ai_agent").then(({ runAgent }) => runAgent(m.userId, roomId));
        }
      }
    }
  }

  return newMessage;
}

export async function rollDiceAction(roomId: number, faces: number, count: number, isPrivate: boolean = false, targetUserId?: number) {
  const { results, sum, notation } = rollDice(faces, count);

  const detail = JSON.stringify({
    dice: `d${faces}`,
    count,
    results,
    sum,
    notation
  });

  const content = `🎲 ${notation}: [${results.join(", ")}] = ${sum}`;

  return await sendMessageAction(roomId, isPrivate ? `🔒 ${content}` : content, "dice", detail, isPrivate, targetUserId);
}

// --- Host Skill Check Request ---

export async function requestSkillCheckAction(
  roomId: number,
  targetUserIds: number[],
  skillName: string,
  diceType: string = "d100"
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));

  const hostNick = hostMember?.nickname || "Host";

  // Get target nicknames
  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  const targetNicks = targetMembers.map((m: any) => m.nickname);
  const t = await getTranslations("roomActions");
  const targetNicksStr = targetNicks.join(t("separator"));
  const content = t("checkRequestContent", { hostNick, targetNicks: targetNicksStr, skillName });
  const detail = JSON.stringify({
    checkRequest: { skillName, diceType, targetUserIds, hostNick }
  });

  const [msg] = await db.insert(messages).values({
    roomId,
    userId: hostId,
    nickname: hostNick,
    type: "check_request",
    content,
    diceDetail: detail,
  }).returning();

  broadcastToRoom(roomId, msg);
  return msg;
}

// --- Room Settings ---

export async function updateRoomSettingsAction(roomId: number, formData: FormData) {
  await checkRoomAccess(roomId, true);

  const theme = ((formData.get("theme") as string) || "default") as Theme;
  const diceRules = ((formData.get("diceRules") as string) || "basic") as DiceRules;
  const ruleTemplate = ((formData.get("ruleTemplate") as string) || "basic") as RuleTemplate;

  await db.update(rooms).set({ theme, diceRules, ruleTemplate }).where(eq(rooms.id, roomId));
  
  broadcastToRoom(roomId, {
    type: "room_settings_updated",
    theme,
    diceRules,
    ruleTemplate,
  });

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt((session.user as any).id);

  if (callerId !== userId) {
    throw new Error("Unauthorized: Cannot execute commands as another user");
  }

  // Ensure they are a member of the room
  await checkRoomAccess(roomId, false);

  const { executeCommand } = await import("@/lib/commands");
  return await executeCommand(roomId, userId, content);
}

export async function deleteSkillAction(roomId: number, userId: number, skillName: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt((session.user as any).id);

  if (callerId !== userId) {
    // If not the owner of the skill, must be the room host
    await checkRoomAccess(roomId, true);
  } else {
    // Must be a member of the room
    await checkRoomAccess(roomId, false);
  }

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt((session.user as any).id);

  if (callerId !== userId) {
    // If not the owner of the skill, must be the room host
    await checkRoomAccess(roomId, true);
  } else {
    // Must be a member of the room
    await checkRoomAccess(roomId, false);
  }

  await db.insert(roomSkills).values({
    roomId,
    userId,
    skillName,
    skillValue,
  }).onConflictDoUpdate({
    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
    set: { skillValue, updatedAt: sqlNow() },
  });
  revalidatePath(`/rooms/${roomId}`);
}

// --- DM/Conversation Actions ---

export async function getUnreadDMCountAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  const { messages, roomDmReads } = await import("@/db/schema");
  const { db, sqlBool } = await import("@/db");
  const { eq, and, sql, not } = await import("drizzle-orm");
  
  // Get all read timestamps for the current user in this room
  const readRecords = await db
    .select()
    .from(roomDmReads)
    .where(and(eq(roomDmReads.roomId, roomId), eq(roomDmReads.userId, userId)));
  
  const lastReadMap: Record<number, string> = {};
  for (const record of readRecords) {
    lastReadMap[record.partnerUserId] = record.lastReadAt;
  }
  
  // Get targeted private messages (DMs) in this room
  const results = await db
    .select({
      senderId: messages.userId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.targetUserId, userId),
        sql`${messages.isPrivate} = ${sqlBool(true)}`,
        not(eq(messages.userId, userId)),
      )
    );
  
  const counts: Record<number, number> = {};
  for (const msg of results) {
    const senderId = msg.senderId;
    const lastRead = lastReadMap[senderId];
    if (!lastRead || msg.createdAt > lastRead) {
      counts[senderId] = (counts[senderId] || 0) + 1;
    }
  }
  return counts;
}

export async function markDMReadAction(roomId: number, senderUserId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  const { roomDmReads } = await import("@/db/schema");
  const { db } = await import("@/db");
  const { eq, and, sql } = await import("drizzle-orm");
  
  await db
    .insert(roomDmReads)
    .values({
      roomId,
      userId,
      partnerUserId: senderUserId,
      lastReadAt: sqlNow(),
    })
    .onConflictDoUpdate({
      target: [roomDmReads.roomId, roomDmReads.userId, roomDmReads.partnerUserId],
      set: { lastReadAt: sqlNow() },
    });
  
  revalidatePath(`/rooms/${roomId}`);
}

export async function loadMoreMessagesAction(roomId: number, beforeMessageId: number, limit = 50) {
  const { userId, isHost } = await checkRoomAccess(roomId, false);

  const visibilityCondition = isHost
    ? and(
        eq(messages.roomId, roomId),
        or(
          not(eq(messages.isPrivate, true)),
          not(eq(messages.type, "system")),
          isNull(messages.targetUserId),
          eq(messages.targetUserId, userId)
        )
      )
    : and(
        eq(messages.roomId, roomId),
        or(
          eq(messages.isPrivate, false),
          eq(messages.targetUserId, userId),
          and(
            eq(messages.userId, userId),
            not(eq(messages.type, "system"))
          )
        )
      );

  const results = await db
    .select()
    .from(messages)
    .where(and(visibilityCondition, lt(messages.id, beforeMessageId)))
    .orderBy(desc(messages.id))
    .limit(limit);

  return results.reverse();
}
