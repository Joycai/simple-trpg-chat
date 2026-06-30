"use server";

import { db, sqlNow } from "@/db";
import { rooms, roomMembers, messages, users, roomSkills, type Theme, type ThemeMode, type RuleTemplate } from "@/db/schema";
import { eq, and, sql, inArray, or, desc, asc, lt, isNull, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import crypto from "crypto";
import { broadcastToRoom } from "@/lib/events";
import { dispatchMessage, messageVisibilityWhere } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import { executeCommand } from "@/lib/commands";
import { rollDice, rollDie } from "@/lib/utils";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { isValidStickerRef } from "@/lib/stickers";
import { parseAvatarDataUrl } from "@/lib/avatars";
import { getTranslations } from "next-intl/server";
import { getRandomColorForUser } from "@/lib/avatar-colors";
import { getRuleForRoom } from "@/lib/rules";
import type { CharacterData } from "@/lib/character-types";

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
    const ruleTemplateRaw = (formData.get("ruleTemplate") as string) || "basic";

    const { THEMES, RULE_TEMPLATES } = await import("@/db/schema");
    if (!THEMES.includes(themeRaw as Theme)) return { success: false, error: "Invalid theme" };
    if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) return { success: false, error: "Invalid ruleTemplate" };
    const theme = themeRaw as Theme;
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
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An error occurred" };
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

    const userId = parseInt(session.user.id);

    const [existing] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

    if (!existing) {
      await db.insert(roomMembers).values({
        roomId,
        userId,
        nickname: session.user.name || "Player",
        avatarColor: getRandomColorForUser(userId),
      });
    }

    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "An error occurred" };
  }
}

// --- Nickname & Character Actions ---

export async function updateCharacterDataAction(roomId: number, characterData: Record<string, unknown>) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

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
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  const trimmed = nickname.trim();
  if (!trimmed || trimmed.length > 50) {
    throw new Error("Invalid nickname (must be between 1 and 50 characters)");
  }

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

  const userId = parseInt(session.user.id);

  // 1. Get the room to check if the caller is the host
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");
  const isHost = room.hostId === userId;

  // Frozen rooms are read-only for non-hosts
  if (room.frozen && !isHost) throw new Error("Room is frozen (read-only)");

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

/**
 * Map the legacy (isPrivate, targetUserId) params carried by genuine chat
 * messages (text/dice/image from clients and bots) to a semantic audience:
 *   public → everyone | DM whisper → dm | GM-private roll (no target) → gm.
 * Notices (system/clue/check_request) never use this — they pass an explicit
 * audience to dispatchMessage directly.
 */
function chatAudience(isPrivate: boolean, targetUserId?: number | null): Audience {
  if (!isPrivate) return "everyone";
  return targetUserId ? "dm" : "gm";
}

export async function sendMessageAction(
  roomId: number,
  content: string,
  type: "text" | "image" | "sticker" = "text",
  isPrivate: boolean = false,
  targetUserId?: number // V3.14: Added targetUserId
) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  // Server Actions accept whatever JSON the client sends — TypeScript's union
  // is just a hint. Clients may only post text/image/sticker through this
  // entrypoint:
  //  - `dice` rolls are produced by rollDiceAction / commands.ts (server is
  //    the source of truth for the result); accepting a client-supplied
  //    diceDetail would let any room member forge a "critical success" bubble.
  //  - `system` notices are emitted internally via dispatchMessage; accepting
  //    them here would let a client inject fake error/info banners that look
  //    like server notifications to other players.
  // Anything else is a typo or attack — bail before we look at content.
  if (type !== "text" && type !== "image" && type !== "sticker") {
    throw new Error("Invalid message type");
  }

  const trimmedContent = content.trim();
  if (type === "text" && (!trimmedContent || trimmedContent.length > 10000)) {
    throw new Error("Message content must be between 1 and 10000 characters");
  }

  // Image messages carry a server-relative image path in `content`. Reject
  // anything that isn't one of our own cached-image URLs (defends against
  // arbitrary/remote URLs being injected as image messages).
  if (type === "image") {
    if (!/^\/api\/rooms\/\d+\/images\/[A-Za-z0-9._-]+$/.test(trimmedContent)) {
      throw new Error("Invalid image reference");
    }
    content = trimmedContent; // store the normalized path
  }

  // Sticker messages carry a server path to a curated sticker. Reject anything
  // that isn't a sticker present in the on-disk manifest.
  if (type === "sticker") {
    if (!isValidStickerRef(trimmedContent)) {
      throw new Error("Invalid sticker reference");
    }
    content = trimmedContent; // store the normalized path
  }

  const t = await getTranslations("roomActions");

  // 0. Scan for sensitive words
  if (type === "text") {
    const matchedWord = await checkSensitiveWords(content);
    if (matchedWord) {
      return await dispatchMessage({
        roomId,
        actorUserId: userId,
        nickname: "SYSTEM",
        type: "system",
        audience: "self", // only the sender sees the interception warning
        channelPartnerId: isPrivate ? targetUserId : undefined, // stay in the channel it was typed in
        content: t("sensitiveWordsIntercepted"),
        systemKind: "error",
      });
    }
  }

  // 1. Intercept for Bot Commands if it's a plain text message starting with '.' or '。'
  if (type === "text" && (content.startsWith(".") || content.startsWith("。"))) {
    const result = await executeCommand(roomId, userId, content, { isPrivate, targetUserId });
    if (result.isCommand) {
      if (!result.success) {
        return await dispatchMessage({
          roomId,
          actorUserId: userId,
          nickname: "SYSTEM",
          type: "system",
          audience: "self", // command errors are shown only to the issuer
          channelPartnerId: isPrivate ? targetUserId : undefined, // stay in the channel it was typed in
          content: t("commandError", { error: result.error || "" }),
          systemKind: "error",
        });
      }
      return result.message;
    }
  }

  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member) throw new Error("Not a member");

  // Text/image/sticker never carry diceDetail — only the internal dice paths
  // (rollDiceAction, commands.ts) attach one. Hard-null it so a client can't
  // smuggle a fake check payload onto a text message that would still flip
  // ChatMessage into the dice-bubble renderer.
  const newMessage = await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname: member.nickname,
    type,
    audience: chatAudience(isPrivate, targetUserId),
    targetUserId,
    content,
    diceDetail: null,
  });

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

/**
 * UI dice roll.
 * - `hidden`: a secret roll — visible only to the roller (audience `self`).
 * - `channelPartnerId`: the DM partner when rolled inside a private channel; this is
 *   the *channel* the roll belongs to. A hidden roll stays in that channel but only
 *   the roller sees it; a normal roll in a DM is a `dm` whisper (both participants).
 */
export async function rollDiceAction(
  roomId: number,
  faces: number,
  count: number,
  hidden: boolean = false,
  channelPartnerId?: number
) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  const { results, sum, notation } = rollDice(faces, count);
  const detail = JSON.stringify({ dice: `d${faces}`, count, results, sum, notation });
  const content = `🎲 ${notation}: [${results.join(", ")}] = ${sum}`;

  const [member] = await db
    .select({ nickname: roomMembers.nickname })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  const audience: Audience = hidden ? "self" : channelPartnerId ? "dm" : "everyone";
  return await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname: member?.nickname || "SYSTEM",
    type: "dice",
    audience,
    // dm targets the partner (WHO); a hidden roll has no audience target. Either way
    // channelPartnerId places it in the right channel (current DM, or public).
    targetUserId: audience === "dm" ? channelPartnerId : undefined,
    channelPartnerId: channelPartnerId ?? undefined,
    content: hidden ? `🔒 ${content}` : content,
    diceDetail: detail,
  });
}

// --- Host Skill Check Request ---

export async function requestSkillCheckAction(
  roomId: number,
  targetUserIds: number[],
  skillName: string,
  diceType: string = "d100",
  isPrivate: boolean = false,
  channelTargetUserId?: number
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const cleanSkill = skillName.trim().slice(0, 50);
  if (!cleanSkill || targetUserIds.length === 0) {
    return { success: false, error: "Invalid check request" };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));

  const hostNick = hostMember?.nickname || "Host";

  // Restrict targets to actual room members (and, in a DM channel, to the partner only).
  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  let validTargetIds = targetMembers.map((m: { userId: number }) => m.userId);
  if (isPrivate && channelTargetUserId) {
    validTargetIds = validTargetIds.filter((id) => id === channelTargetUserId);
  }
  if (validTargetIds.length === 0) {
    return { success: false, error: "No valid targets" };
  }

  const targetNicks = targetMembers
    .filter((m: { userId: number }) => validTargetIds.includes(m.userId))
    .map((m: { nickname: string }) => m.nickname);
  const t = await getTranslations("roomActions");
  const targetNicksStr = targetNicks.join(t("separator"));
  const content = t("checkRequestContent", { hostNick, targetNicks: targetNicksStr, skillName: cleanSkill });
  const detail = JSON.stringify({
    checkRequest: { skillName: cleanSkill, diceType, targetUserIds: validTargetIds, hostNick, respondedUserIds: [] }
  });

  const msg = await dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname: hostNick,
    type: "check_request",
    // A check issued in a DM belongs to that DM; a public check is for everyone.
    audience: isPrivate ? "dm" : "everyone",
    targetUserId: isPrivate ? channelTargetUserId : null,
    content,
    diceDetail: detail,
  });

  // Trigger any bot targets so they can respond (if their respond_check tool is enabled).
  const botTargets = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, validTargetIds), eq(users.isBot, true)));
  for (const bot of botTargets) {
    import("@/lib/ai_agent")
      .then(({ runAgent }) => runAgent(bot.id, roomId, { triggeringUserId: hostId, isPrivate }))
      .catch((err) => console.error("[requestSkillCheckAction] Failed to trigger bot:", err));
  }

  return msg;
}

/**
 * A designated target responds to a host check request: rolls the check in the same
 * channel, records the response on the check_request message, and broadcasts a
 * `check_update` so all clients update the x/y count and disable the roller's dice icon.
 */
export async function respondToCheckRequestAction(
  roomId: number,
  checkRequestId: number,
  opts?: { onBehalfOfUserId?: number }
): Promise<{ success: boolean; error?: string; needsSkill?: boolean }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt(session.user.id);

  const proxyTargetId = opts?.onBehalfOfUserId;
  const isProxy = typeof proxyTargetId === "number";

  // Proxy is host-only; self-response stays writable-member.
  if (isProxy) {
    await checkRoomAccess(roomId, true);
  } else {
    await checkRoomAccess(roomId, false, { requireWritable: true });
  }
  const rollerId = isProxy ? proxyTargetId : callerId;

  const t = await getTranslations("roomActions");

  const [msg] = await db.select().from(messages)
    .where(and(eq(messages.id, checkRequestId), eq(messages.roomId, roomId)));
  if (!msg || msg.type !== "check_request" || !msg.diceDetail) {
    return { success: false, error: t("checkRequestNotFound") };
  }

  let detail: { checkRequest?: { skillName?: string; diceType?: string; targetUserIds?: number[]; respondedUserIds?: number[]; proxiedUserIds?: number[]; sanCheck?: { successExpr: string; failureExpr: string } } };
  try { detail = JSON.parse(msg.diceDetail); } catch { return { success: false, error: t("checkRequestNotFound") }; }
  const cr = detail.checkRequest;
  if (!cr || !cr.skillName) return { success: false, error: t("checkRequestNotFound") };

  const targetUserIds = cr.targetUserIds || [];
  const responded = cr.respondedUserIds || [];
  if (!targetUserIds.includes(rollerId)) return { success: false, error: t("checkNotTarget") };
  if (responded.includes(rollerId)) return { success: false, error: t("checkAlreadyDone") };

  // For a proxy roll, surface the host's nickname so the dice bubble can show
  // a "代投 by <host>" chip (filled in by commands.ts via diceDetail).
  let proxiedBy: { userId: number; nickname: string } | undefined;
  if (isProxy) {
    const [hostMember] = await db.select({ nickname: roomMembers.nickname }).from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, callerId)));
    proxiedBy = { userId: callerId, nickname: hostMember?.nickname || "Host" };
  }

  // Roll in the same channel as the request (public, or the DM with the host).
  const ctxIsPrivate = msg.isPrivate;
  const ctxTargetId = msg.isPrivate ? msg.userId : undefined;
  if (cr.sanCheck) {
    // Sanity check: run the .sc logic (uses 理智值 current value + deducts per result).
    const result = await executeCommand(roomId, rollerId, `.sc ${cr.sanCheck.successExpr}/${cr.sanCheck.failureExpr}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
    if (!result.success) {
      if (isProxy && result.code === "STAT_NOT_SET") {
        // Player has no 理智值 yet — fall through to a raw d100 attributed to them,
        // so the host gets a usable roll result instead of a hard error.
        await executeCommand(roomId, rollerId, `.rd100`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      } else {
        // needsSkill prompts the *self* to set their stat — meaningless for a proxy roll,
        // so surface as plain error and let the host inform the player out-of-band.
        return { success: false, error: result.error, needsSkill: !isProxy && result.code === "STAT_NOT_SET" };
      }
    }
  } else {
    const diceType = cr.diceType || "d100";
    if (diceType === "d100") {
      const result = await executeCommand(roomId, rollerId, `.rc ${cr.skillName}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      if (!result.success) {
        if (isProxy && result.code === "STAT_NOT_SET") {
          // Skill not set on this player — drop the success/failure grading and just
          // roll a raw d100, attributed to the player + carrying the proxy chip.
          await executeCommand(roomId, rollerId, `.rd100`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
        } else {
          return { success: false, error: result.error, needsSkill: !isProxy && result.code === "STAT_NOT_SET" };
        }
      }
    } else {
      const faces = parseInt(diceType.replace("d", ""));
      if (isProxy) {
        // Route through executeCommand so the roll is attributed to the player and
        // carries the proxy chip; rollDiceAction would attribute to the caller (host).
        await executeCommand(roomId, rollerId, `.rd${faces}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      } else {
        // A check response is a normal roll in the request's channel (never hidden).
        await rollDiceAction(roomId, faces, 1, false, ctxTargetId);
      }
    }
  }

  // Record the response and broadcast the updated completion state.
  const newResponded = [...responded, rollerId];
  cr.respondedUserIds = newResponded;
  if (isProxy) {
    cr.proxiedUserIds = [...(cr.proxiedUserIds ?? []), rollerId];
  }
  await db.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, checkRequestId));
  // NOTE: do NOT reuse the message id here. The SSE stream dedups by `id`, and the
  // original check_request message (same id) was already delivered, so an `id`-keyed
  // event would be dropped server-side. Carry the target id under `checkRequestId`,
  // and mirror the request's audience so DM check_updates reach only the pair.
  broadcastToRoom(roomId, {
    type: "check_update",
    checkRequestId,
    respondedUserIds: newResponded,
    proxiedUserIds: cr.proxiedUserIds,
    audience: msg.audience,
    userId: msg.userId,
    targetUserId: msg.targetUserId,
  });

  return { success: true };
}

/**
 * Host-side preview for the proxy-roll popover: list every still-pending target
 * with their nickname and resolved check value (skill > COC attribute > resource),
 * so the host can see at a glance what they're about to roll against.
 */
export async function getProxyCheckTargetsAction(
  roomId: number,
  checkRequestId: number
): Promise<{
  success: boolean;
  error?: string;
  skillName?: string;
  isSanityCheck?: boolean;
  targets?: Array<{ userId: number; nickname: string; value: number | null }>;
}> {
  await checkRoomAccess(roomId, true);

  const [msg] = await db.select().from(messages)
    .where(and(eq(messages.id, checkRequestId), eq(messages.roomId, roomId)));
  if (!msg || msg.type !== "check_request" || !msg.diceDetail) {
    return { success: false, error: "check_request not found" };
  }
  let detail: { checkRequest?: { skillName?: string; targetUserIds?: number[]; respondedUserIds?: number[]; sanCheck?: unknown } };
  try { detail = JSON.parse(msg.diceDetail); } catch { return { success: false, error: "malformed detail" }; }
  const cr = detail.checkRequest;
  if (!cr || !cr.skillName || !cr.targetUserIds?.length) return { success: false, error: "invalid request" };

  const pending = cr.targetUserIds.filter((id: number) => !(cr.respondedUserIds || []).includes(id));
  if (pending.length === 0) {
    return { success: true, skillName: cr.skillName, isSanityCheck: !!cr.sanCheck, targets: [] };
  }

  const members = await db.select({
    userId: roomMembers.userId,
    nickname: roomMembers.nickname,
    characterData: roomMembers.characterData,
  })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, pending)));
  const memberByUid = new Map(members.map((m) => [m.userId, m]));

  const skillRows = await db.select().from(roomSkills)
    .where(and(
      eq(roomSkills.roomId, roomId),
      inArray(roomSkills.userId, pending),
      eq(roomSkills.skillName, cr.skillName),
    ));
  const valueByUid = new Map(skillRows.map((r: { userId: number; skillValue: number }) => [r.userId, r.skillValue]));

  // Rule-specific fallback (attribute / resource current value) for users
  // without an explicit room_skills row. Sanity check always reads the
  // player's current 理智值, so the lookup name is forced to "san" then.
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rule = room ? getRuleForRoom(room) : null;
  const lookupName = cr.sanCheck ? "san" : cr.skillName;

  const targets = pending.map((uid: number) => {
    const m = memberByUid.get(uid);
    let value: number | null = valueByUid.get(uid) ?? null;
    if (value === null && rule && m?.characterData) {
      try {
        const sheet = JSON.parse(m.characterData) as CharacterData;
        const fallback = rule.lookupFallback(lookupName, sheet);
        if (fallback) value = fallback.value;
      } catch { /* leave value as null */ }
    }
    return { userId: uid, nickname: m?.nickname || `#${uid}`, value };
  });

  return { success: true, skillName: cr.skillName, isSanityCheck: !!cr.sanCheck, targets };
}

/**
 * COC 7th — Psychology hidden roll (心理学暗骰). KP rolls the 心理学 skill secretly for
 * each selected player; the result is shown ONLY to the KP. Each player just gets a
 * notification that a psychology check was made on them (no result). If a player hasn't
 * set 心理学, a plain d100 is rolled (still labelled as a psychology hidden roll).
 */
export async function psychologyHiddenRollAction(
  roomId: number,
  targetUserIds: number[],
  channelPartnerId?: number // when initiated inside a DM, keep the result/notify in that DM
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, error: "Room not found" };
  if (!getRuleForRoom(room).capabilities.hasPsychologyRoll) {
    return { success: false, error: "Psychology hidden roll not supported by this rule" };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  const hostNick = hostMember?.nickname || "KP";

  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  if (targetMembers.length === 0) return { success: false, error: "No valid targets" };

  const tRoom = await getTranslations("roomActions");

  for (const member of targetMembers) {
    const plId = member.userId;
    const plNick = member.nickname;

    const [skill] = await db.select().from(roomSkills).where(
      and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, plId), eq(roomSkills.skillName, "心理学"))
    );
    const roll = rollDie(100);

    // 1) KP-only dice bubble — structured diceDetail so the UI shows a normal
    //    check layout (skill / d100 / target / grade chip) with the dashed
    //    "audience=self" border and an eye icon driven by `psy: true`.
    let hostCheck: { skillName: string; target: number; roll: number; success: boolean; grade: "success" | "failure" | "critical" | "fumble" } | undefined;
    if (skill) {
      const target = skill.skillValue;
      const success = roll <= target;
      let grade: "success" | "failure" | "critical" | "fumble" = success ? "success" : "failure";
      if (roll <= 5) grade = "critical";
      else if (roll >= 96) grade = "fumble";
      hostCheck = { skillName: "心理学", target, roll, success, grade };
    }
    const hostDetail = JSON.stringify({
      notation: "1d100",
      dice: "1d100",
      sum: roll,
      results: [roll],
      ...(hostCheck ? { check: hostCheck } : {}),
      psy: { hostNick, targetNick: plNick },
    });
    const hostContent = skill
      ? tRoom("psyHeader", { hostNick, targetNick: plNick })
      : tRoom("psyHeaderNoSkill", { hostNick, targetNick: plNick });

    await dispatchMessage({
      roomId, actorUserId: hostId, nickname: hostNick,
      type: "dice", audience: "self", channelPartnerId,
      content: hostContent,
      diceDetail: hostDetail,
    });

    // 2) Player-side ghost notification — a check_request that's already "done"
    //    (respondedUserIds prefilled) so the UI shows the暗骰 badge with no
    //    action button. `ghost: true` routes the client to data-check-kind=gm-private.
    const playerDetail = JSON.stringify({
      checkRequest: {
        skillName: "心理学",
        diceType: "1d100",
        hostNick,
        targetUserIds: [plId],
        respondedUserIds: [plId],
        ghost: true,
      },
    });
    await dispatchMessage({
      roomId, actorUserId: hostId, nickname: hostNick,
      type: "check_request", audience: "recipient", targetUserId: plId, channelPartnerId,
      content: tRoom("psyNotify", { hostNick }),
      diceDetail: playerDetail,
    });
  }

  return { success: true };
}

/**
 * COC 7th — Sanity check request (理智检定). Like requestSkillCheckAction, but carries the
 * success/failure loss expressions; when a target rolls, respondToCheckRequestAction runs
 * the .sc logic (uses their 理智值 current value and deducts per result).
 */
export async function requestSanCheckAction(
  roomId: number,
  targetUserIds: number[],
  successExpr: string,
  failureExpr: string,
  isPrivate: boolean = false,
  channelTargetUserId?: number
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, error: "Room not found" };
  if (!getRuleForRoom(room).capabilities.hasSanity) {
    return { success: false, error: "Sanity check not supported by this rule" };
  }

  const sExpr = (successExpr || "").trim();
  const fExpr = (failureExpr || "").trim();
  const exprOk = (e: string) => e.length > 0 && e.length <= 30 && /^[0-9a-z+\-d\s]+$/i.test(e);
  if (!exprOk(sExpr) || !exprOk(fExpr) || targetUserIds.length === 0) {
    return { success: false, error: "Invalid san check" };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  const hostNick = hostMember?.nickname || "Host";

  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  let validTargetIds = targetMembers.map((m: { userId: number }) => m.userId);
  if (isPrivate && channelTargetUserId) {
    validTargetIds = validTargetIds.filter((id) => id === channelTargetUserId);
  }
  if (validTargetIds.length === 0) return { success: false, error: "No valid targets" };

  const targetNicks = targetMembers
    .filter((m: { userId: number }) => validTargetIds.includes(m.userId))
    .map((m: { nickname: string }) => m.nickname);
  const t = await getTranslations("roomActions");
  const targetNicksStr = targetNicks.join(t("separator"));
  const content = t("sanCheckRequestContent", { hostNick, targetNicks: targetNicksStr });
  const detail = JSON.stringify({
    checkRequest: { skillName: "理智值", diceType: "d100", targetUserIds: validTargetIds, hostNick, respondedUserIds: [], sanCheck: { successExpr: sExpr, failureExpr: fExpr } }
  });

  const msg = await dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname: hostNick,
    type: "check_request",
    audience: isPrivate ? "dm" : "everyone",
    targetUserId: isPrivate ? channelTargetUserId : null,
    content,
    diceDetail: detail,
  });

  // Trigger any bot targets so they can respond (if their respond_check tool is enabled).
  const botTargets = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, validTargetIds), eq(users.isBot, true)));
  for (const bot of botTargets) {
    import("@/lib/ai_agent")
      .then(({ runAgent }) => runAgent(bot.id, roomId, { triggeringUserId: hostId, isPrivate }))
      .catch((err) => console.error("[requestSanityCheckAction] Failed to trigger bot:", err));
  }

  return msg;
}

// --- Room Settings ---

export async function updateRoomSettingsAction(roomId: number, formData: FormData) {
  await checkRoomAccess(roomId, true);

  const themeRaw = ((formData.get("theme") as string) || "default");
  const themeModeRaw = ((formData.get("themeMode") as string) || "auto");
  const ruleTemplateRaw = ((formData.get("ruleTemplate") as string) || "basic");

  const { THEMES, THEME_MODES, RULE_TEMPLATES } = await import("@/db/schema");
  if (!THEMES.includes(themeRaw as Theme)) throw new Error("Invalid theme");
  if (!THEME_MODES.includes(themeModeRaw as ThemeMode)) throw new Error("Invalid themeMode");
  if (!RULE_TEMPLATES.includes(ruleTemplateRaw as RuleTemplate)) throw new Error("Invalid ruleTemplate");
  const theme = themeRaw as Theme;
  const themeMode = themeModeRaw as ThemeMode;
  const ruleTemplate = ruleTemplateRaw as RuleTemplate;

  await db.update(rooms).set({ theme, themeMode, ruleTemplate }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
    theme,
    themeMode,
    ruleTemplate,
  });

  revalidatePath(`/rooms/${roomId}`);
}

export async function updateRoomNameAction(roomId: number, newName: string) {
  await checkRoomAccess(roomId, true);

  const trimmed = newName.trim();
  if (!trimmed || trimmed.length > 100) {
    throw new Error("Room name must be between 1 and 100 characters");
  }

  await db.update(rooms).set({ name: trimmed }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
}

/** Host-only: toggle a room between active and frozen (read-only for players). */
export async function setRoomFrozenAction(roomId: number, frozen: boolean) {
  await checkRoomAccess(roomId, true);

  await db.update(rooms).set({ frozen }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
}

export async function regenerateRoomPasswordAction(roomId: number) {
  await checkRoomAccess(roomId, true);

  const newPassword = crypto.randomBytes(4).toString("hex");
  await db.update(rooms).set({ secretKey: newPassword }).where(eq(rooms.id, roomId));

  broadcastToRoom(roomId, {
    type: "room_settings_updated",
  });

  revalidatePath(`/rooms/${roomId}`);
  return { secretKey: newPassword };
}

// --- Data Fetching ---

export async function getRoomMessages(roomId: number) {
  const { userId, isHost } = await checkRoomAccess(roomId, false);

  return await db
    .select()
    .from(messages)
    .where(messageVisibilityWhere(roomId, userId, isHost))
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

export async function executeCommandAction(
  roomId: number,
  userId: number,
  content: string,
  isPrivate?: boolean,
  targetUserId?: number
) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt(session.user.id);

  if (callerId !== userId) {
    throw new Error("Unauthorized: Cannot execute commands as another user");
  }

  // Ensure they are a member of the room
  await checkRoomAccess(roomId, false, { requireWritable: true });

  return await executeCommand(roomId, userId, content, { isPrivate, targetUserId });
}

export async function deleteSkillAction(roomId: number, userId: number, skillName: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt(session.user.id);

  if (callerId !== userId) {
    // If not the owner of the skill, must be the room host
    await checkRoomAccess(roomId, true);
  } else {
    // Must be a member of the room
    await checkRoomAccess(roomId, false, { requireWritable: true });
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
  const callerId = parseInt(session.user.id);

  if (callerId !== userId) {
    // If not the owner of the skill, must be the room host
    await checkRoomAccess(roomId, true);
  } else {
    // Must be a member of the room
    await checkRoomAccess(roomId, false, { requireWritable: true });
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
        // Only genuine 1:1 DM turns count as unread — inline notices (system/clue
        // directed messages, GM rolls) carry their own indicators, not a DM badge.
        eq(messages.audience, "dm"),
        eq(messages.targetUserId, userId),
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

  const results = await db
    .select()
    .from(messages)
    .where(and(messageVisibilityWhere(roomId, userId, isHost), lt(messages.id, beforeMessageId)))
    .orderBy(desc(messages.id))
    .limit(limit);

  return results.reverse();
}

// --- Avatar Actions ---

export async function uploadAvatarAction(
  roomId: number,
  imageData: string
) {
  // Validate membership + reject when the room is frozen (read-only for non-hosts)
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  // Strict whitelist: only JPEG data URLs, capped size, real JPEG magic + dims ≤ 512.
  // AvatarCropper always emits 512x512 JPEG; anything else is rejected so SVG/
  // mislabelled payloads can't reach the DB or downstream <img> renders.
  const parsed = parseAvatarDataUrl(imageData);
  if (!parsed.ok) {
    const msg =
      parsed.error === "too_large" ? "Image is too large" :
      parsed.error === "bad_dimensions" ? "Avatar must be 512x512 or smaller" :
      "Invalid image data";
    throw new Error(msg);
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
