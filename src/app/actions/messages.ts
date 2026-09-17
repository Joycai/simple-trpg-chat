"use server";

import { db, sqlNow } from "@/db";
import { roomMembers, messages, users, roomDmReads } from "@/db/schema";
import { eq, and, sql, or, desc, lt, gt, isNull, not } from "drizzle-orm";
import { auth } from "@/auth";
import { broadcastToRoom } from "@/lib/server/events";
import { dispatchMessage, messageVisibilityWhere } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import { executeCommand } from "@/lib/commands/engine";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { checkSensitiveWords } from "@/lib/security/sensitive-words";
import { isValidStickerRef } from "@/lib/media/stickers";
import { getTranslations, getLocale } from "next-intl/server";
import { buildTimelinePayload, composeTimelineLabel, sanitizeTimelineDivider, type TimelineDividerData } from "@/lib/messaging/timeline-payload";
import { botActivationMode } from "@/lib/ai/bot-status";
import { dispatchDiceRoll } from "@/lib/messaging/dice-roll";

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
  //  - `dice` rolls are produced by rollDiceAction / commands/engine.ts (server is
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

  // Single join for everything this action needs about the sender (nickname
  // for the message row, isBot for the activation gate below) — this used to
  // be two separate SELECTs per message.
  const [sender] = await db
    .select({ nickname: roomMembers.nickname, isBot: users.isBot })
    .from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!sender) throw new Error("Not a member");

  // Text/image/sticker never carry diceDetail — only the internal dice paths
  // (rollDiceAction, commands/engine.ts) attach one. Hard-null it so a client can't
  // smuggle a fake check payload onto a text message that would still flip
  // ChatMessage into the dice-bubble renderer.
  const newMessage = await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname: sender.nickname,
    type,
    audience: chatAudience(isPrivate, targetUserId),
    targetUserId,
    content,
    diceDetail: null,
  });

  // --- AI Bot Activation Check ---
  if (type === "text" && !sender.isBot) {
    if (isPrivate && targetUserId) {
      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
      // Bots set to "manual" activation only respond to explicit host acts
      // (trigger button, check requests) — not to auto-triggers.
      if (targetUser && targetUser.isBot && botActivationMode(targetUser.botConfigJson) !== "manual") {
        // Trigger Agent (async)
        import("@/lib/ai/agent")
          .then(({ runAgent }) => runAgent(targetUserId, roomId, { triggeringUserId: userId, isPrivate: true }))
          .catch((err) => console.error("[sendMessageAction] Failed to trigger AI agent (private DM):", err));
      }
    } else if (!isPrivate) {
      // Check for bot mentions async — don't block the response
      const capturedContent = content;
      const capturedRoomId = roomId;
      const capturedUserId = userId;
      import("@/lib/ai/agent")
        .then(async ({ runAgent }) => {
          const roomBots = await db.query.roomMembers.findMany({
            where: eq(roomMembers.roomId, capturedRoomId),
            with: { user: true }
          });
          for (const m of roomBots) {
            if (m.user.isBot && botActivationMode(m.user.botConfigJson) !== "manual" && (capturedContent.includes(`@${m.user.displayName}`) || capturedContent.includes(`@${m.nickname}`))) {
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
  return dispatchDiceRoll(roomId, userId, faces, count, hidden, channelPartnerId);
}

// --- Timeline divider (host-only) ---

/**
 * Insert a "timeline divider" system message into the public feed — a host-only
 * marker separating in-game dates. The payload is stored in `diceDetail` so the
 * chat UI can recompose a localized label; `content` holds a plain fallback.
 */
export async function insertTimelineDividerAction(
  roomId: number,
  data: TimelineDividerData,
): Promise<{ success: boolean; error?: string }> {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  // Reject anything the modal shouldn't have produced. These rules now live in
  // timeline-payload.ts so the event module gates its own writes with the same
  // ones rather than its own (non-)validation.
  const clean = sanitizeTimelineDivider(data);
  if (!clean) return { success: false, error: "Invalid timeline payload" };

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  const hostNick = hostMember?.nickname || "Host";

  // Plain-text fallback label (localized to the room's active request locale).
  const t = await getTranslations("timeline");
  const locale = await getLocale();
  const label = composeTimelineLabel(clean, t, locale);

  await dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname: hostNick,
    type: "system",
    audience: "everyone",
    systemKind: "timeline-divider",
    content: label,
    diceDetail: buildTimelinePayload(clean),
  });

  return { success: true };
}

/**
 * Withdraw (delete) a timeline divider. Host-only, and only rows that are
 * actually timeline dividers in this room. Broadcasts a `message_deleted` event
 * (keyed by `messageId`, not `id`, to bypass the SSE per-stream id dedup) so
 * every client removes the row.
 */
export async function withdrawTimelineDividerAction(
  roomId: number,
  messageId: number,
): Promise<{ success: boolean; error?: string }> {
  await checkRoomAccess(roomId, true);

  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!row || row.roomId !== roomId || row.type !== "system" || row.systemKind !== "timeline-divider") {
    return { success: false, error: "Not a timeline divider" };
  }

  await db.delete(messages).where(eq(messages.id, messageId));
  broadcastToRoom(roomId, { type: "message_deleted", messageId });

  return { success: true };
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

// --- DM/Conversation Actions ---

export async function getUnreadDMCountAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

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
  // No revalidatePath here: unread state is client-managed (setUnreadCounts),
  // and this action fires for EVERY inbound DM while its tab is active — the
  // revalidate was embedding a full room-page RSC render into each response
  // (per message, during bot streaming). The DB write alone is the contract.
}

// --- History loading ---
// (No unbounded full-history fetch here on purpose: the page query and
// loadMoreMessagesAction / catchUpMessagesAction are all limit-bounded, and
// every exported "use server" function is callable by any authenticated
// member with a crafted POST.)


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

/**
 * Reconnect catch-up: everything visible to this user newer than the last
 * message the client saw before its SSE stream dropped. The server emits no
 * `id:` field on SSE frames, so Last-Event-ID replay can't work — the client
 * heals the gap itself (see useRoomEvents). Newest-first + reverse mirrors
 * the initial page query; the limit bounds a very long offline gap, in which
 * case the newest `limit` rows win (same trade-off as a fresh page load).
 */
export async function catchUpMessagesAction(roomId: number, sinceMessageId: number, limit = 300) {
  const { userId, isHost } = await checkRoomAccess(roomId, false);

  const results = await db
    .select()
    .from(messages)
    .where(and(messageVisibilityWhere(roomId, userId, isHost), gt(messages.id, sinceMessageId)))
    .orderBy(desc(messages.id))
    .limit(limit);

  return results.reverse();
}
