"use server";

import { db, sqlNow, sqlBool } from "@/db";
import { rooms, roomMembers, messages, users, roomSkills, type Theme, type DiceRules, type RuleTemplate } from "@/db/schema";
import { eq, and, sql, inArray, or, desc, asc, lt, isNull, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/events";
import { executeCommand } from "@/lib/commands";
import { rollDice } from "@/lib/utils";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { getTranslations } from "next-intl/server";
import { getRandomColorForUser } from "@/lib/avatar-colors";

// --- Room Actions ---

export async function createRoomAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "host") {
      return { success: false, error: "Only hosts can create rooms" };
    }

    const name = formData.get("name") as string;
    const customKey = formData.get("key") as string;
    const themeRaw = (formData.get("theme") as string) || "default";
    const diceRulesRaw = (formData.get("diceRules") as string) || "basic";
    const ruleTemplateRaw = (formData.get("ruleTemplate") as string) || "basic";

    const { THEMES, DICE_RULES, RULE_TEMPLATES } = await import("@/db/schema");
    if (!THEMES.includes(themeRaw as Theme)) return { success: false, error: "Invalid theme" };
    if (!DICE_RULES.includes(diceRulesRaw as DiceRules)) return { success: false, error: "Invalid diceRules" };
    if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) return { success: false, error: "Invalid ruleTemplate" };
    const theme = themeRaw as Theme;
    const diceRules = diceRulesRaw as DiceRules;
    const ruleTemplate = ruleTemplateRaw as RuleTemplate;

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
      avatarColor: getRandomColorForUser(parseInt(session.user.id)),
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
        avatarColor: getRandomColorForUser(userId),
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

  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 50) {
    throw new Error("Invalid nickname (must be between 1 and 50 characters)");
  }

  const userId = parseInt((session.user as any).id);

  await db.update(roomMembers)
    .set({ nickname: trimmed })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
}

export async function updateRoomMemberColorAction(roomId: number, targetUserId: number, color: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  // 1. Get the room to check if the caller is the host
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");
  const isHost = room.hostId === userId;

  // 2. Determine if allowed
  let allowed = false;
  if (targetUserId === userId) {
    allowed = true; // Allowed to edit own color
  } else if (isHost) {
    // Host can edit bot colors — verify target is a bot and belongs to this room
    const [targetUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, targetUserId));
    if (targetUser && targetUser.isBot) {
      const [botInRoom] = await db.select({ id: roomMembers.id })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));
      if (botInRoom) allowed = true;
    }
  }

  if (!allowed) throw new Error("Unauthorized to change this user's color");

  // 3. Update the color in roomMembers
  await db.update(roomMembers)
    .set({ avatarColor: color })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

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

  const trimmedContent = content.trim();
  if (type === "text" && (!trimmedContent || trimmedContent.length > 10000)) {
    throw new Error("Message content must be between 1 and 10000 characters");
  }

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

  // 1. Intercept for Bot Commands if it's a plain text message starting with '.' or '。'
  if (type === "text" && (content.startsWith(".") || content.startsWith("。"))) {
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
        import("@/lib/ai_agent")
          .then(({ runAgent }) => runAgent(targetUserId, roomId, { triggeringUserId: userId, isPrivate: true }))
          .catch((err) => console.error("[sendMessageAction] Failed to trigger AI agent (private DM):", err));
      }
    } else if (!isPrivate) {
      // Check for bot mentions async — don't block the response
      const capturedContent = content;
      const capturedRoomId = roomId;
      const capturedUserId = userId;
      import("@/lib/ai_agent")
        .then(async ({ runAgent }) => {
          const roomBots = await db.query.roomMembers.findMany({
            where: eq(roomMembers.roomId, capturedRoomId),
            with: { user: true }
          });
          for (const m of roomBots) {
            if (m.user.isBot && (capturedContent.includes(`@${m.user.displayName}`) || capturedContent.includes(`@${m.nickname}`))) {
              await runAgent(m.userId, capturedRoomId, { triggeringUserId: capturedUserId, isPrivate: false });
            }
          }
        })
        .catch((err) => console.error("[sendMessageAction] Failed to trigger AI agent (mention):", err));
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

  const themeRaw = ((formData.get("theme") as string) || "default");
  const diceRulesRaw = ((formData.get("diceRules") as string) || "basic");
  const ruleTemplateRaw = ((formData.get("ruleTemplate") as string) || "basic");

  const { THEMES, DICE_RULES, RULE_TEMPLATES } = await import("@/db/schema");
  if (!THEMES.includes(themeRaw as Theme)) throw new Error("Invalid theme");
  if (!DICE_RULES.includes(diceRulesRaw as DiceRules)) throw new Error("Invalid diceRules");
  if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) throw new Error("Invalid ruleTemplate");
  const theme = themeRaw as Theme;
  const diceRules = diceRulesRaw as DiceRules;
  const ruleTemplate = ruleTemplateRaw as RuleTemplate;

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
  const { userId, isHost } = await checkRoomAccess(roomId, false);

  const visibilityCondition = isHost
    ? and(
        eq(messages.roomId, roomId),
        or(
          not(eq(messages.isPrivate, true)),
          and(
            eq(messages.isPrivate, true),
            or(
              isNull(messages.targetUserId),
              eq(messages.targetUserId, userId),
              eq(messages.userId, userId)
            )
          )
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

  return await db
    .select()
    .from(messages)
    .where(visibilityCondition)
    .orderBy(asc(messages.id));
}

export async function getRoomSkills(roomId: number, userId: number) {
  await checkRoomAccess(roomId, false);
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
  const { roomDmReads } = await import("@/db/schema");

  // Single SQL query: count unread DMs per sender using a LEFT JOIN against read timestamps
  const rows = await db
    .select({
      senderId: messages.userId,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(messages)
    .leftJoin(
      roomDmReads,
      and(
        eq(roomDmReads.roomId, roomId),
        eq(roomDmReads.userId, userId),
        eq(roomDmReads.partnerUserId, messages.userId)
      )
    )
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.targetUserId, userId),
        sql`${messages.isPrivate} = ${sqlBool(true)}`,
        not(eq(messages.userId, userId)),
        or(
          isNull(roomDmReads.lastReadAt),
          sql`${messages.createdAt} > ${roomDmReads.lastReadAt}`
        )
      )
    )
    .groupBy(messages.userId);

  const counts: Record<number, number> = {};
  for (const row of rows) {
    counts[row.senderId] = row.count;
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
          and(
            eq(messages.isPrivate, true),
            or(
              isNull(messages.targetUserId),
              eq(messages.targetUserId, userId),
              eq(messages.userId, userId)
            )
          )
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

// --- Avatar Actions ---

export async function uploadAvatarAction(
  roomId: number,
  imageData: string
) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  // Validate room membership
  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member) throw new Error("You are not a member of this room");

  // Validate the image data
  if (!imageData.startsWith("data:image/")) {
    throw new Error("Invalid image data");
  }

  // Enforce size limit (~350KB base64)
  if (imageData.length > 500000) {
    throw new Error("Image is too large");
  }

  // Update the avatar in the database
  await db.update(roomMembers)
    .set({ avatar: imageData })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}
