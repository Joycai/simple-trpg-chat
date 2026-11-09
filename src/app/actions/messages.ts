"use server";

import { db, sqlNow } from "@/db";
import { roomMembers, messages, users, roomDmReads } from "@/db/schema";
import { eq, and, desc, lt, gt } from "drizzle-orm";
import { auth } from "@/auth";
import { broadcastToRoom } from "@/lib/server/events";
import { dispatchMessage, messageVisibilityWhere } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import { executeCommand } from "@/lib/commands/engine";
import type { CommandResult } from "@/lib/commands/command-types";
import { checkRoomAccess, tryRoomAccess } from "@/lib/auth/room-access";
import { checkSensitiveWords } from "@/lib/security/sensitive-words";
import { isValidStickerRef } from "@/lib/media/stickers";
import { getTranslations, getLocale } from "next-intl/server";
import { buildTimelinePayload, composeTimelineLabel, sanitizeTimelineDivider, type TimelineDividerData } from "@/lib/messaging/timeline-payload";
import { botActivationMode } from "@/lib/ai/bot-status";
import { dispatchDiceRoll } from "@/lib/messaging/dice-roll";
import { isDiceSpec } from "@/lib/commands/dice";
import { MESSAGE_MAX_LENGTH, HISTORY_PAGE_LIMIT, HISTORY_PAGE_LIMIT_MAX, CATCH_UP_LIMIT, CATCH_UP_LIMIT_MAX } from "@/lib/room/limits";
import type { Done, Fail } from "@/lib/actions/result";
import { noRoomAccess } from "@/lib/actions/no-room-access";

async function roomActionsError(key: string, params?: Record<string, number>): Promise<Fail> {
  return { success: false, error: (await getTranslations("roomActions"))(key, params) };
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
  targetUserId?: number, // V3.14: Added targetUserId
  origin?: string,
): Promise<Done> {
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return noRoomAccess();
  const { userId } = access;

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
    return roomActionsError("errorInvalidMessageType");
  }

  const trimmedContent = content.trim();
  if (type === "text" && (!trimmedContent || trimmedContent.length > MESSAGE_MAX_LENGTH)) {
    return roomActionsError("errorMessageLength", { max: MESSAGE_MAX_LENGTH });
  }

  // Image messages carry a server-relative image path in `content`. Reject
  // anything that isn't one of our own cached-image URLs (defends against
  // arbitrary/remote URLs being injected as image messages).
  if (type === "image") {
    if (!/^\/api\/rooms\/\d+\/images\/[A-Za-z0-9._-]+$/.test(trimmedContent)) {
      return roomActionsError("errorInvalidImageRef");
    }
    content = trimmedContent; // store the normalized path
  }

  // Sticker messages carry a server path to a curated sticker. Reject anything
  // that isn't a sticker present in the on-disk manifest.
  if (type === "sticker") {
    if (!isValidStickerRef(trimmedContent)) {
      return roomActionsError("errorInvalidStickerRef");
    }
    content = trimmedContent; // store the normalized path
  }

  const t = await getTranslations("roomActions");

  // 0. Scan for sensitive words
  if (type === "text") {
    const matchedWord = await checkSensitiveWords(content);
    if (matchedWord) {
      await dispatchMessage({
        roomId,
        actorUserId: userId,
        nickname: "SYSTEM",
        type: "system",
        audience: "self", // only the sender sees the interception warning
        channelPartnerId: isPrivate ? targetUserId : undefined, // stay in the channel it was typed in
        content: t("sensitiveWordsIntercepted"),
        systemKind: "error",
      });
      return { success: true };
    }
  }

  // 1. Intercept for Bot Commands if it's a plain text message starting with '.' or '。'
  if (type === "text" && (content.startsWith(".") || content.startsWith("。"))) {
    const result = await executeCommand(roomId, userId, content, { isPrivate, targetUserId, origin });
    if (result.isCommand) {
      if (!result.success) {
        await dispatchMessage({
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
      return { success: true };
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

  if (!sender) return noRoomAccess();

  // Text/image/sticker never carry diceDetail — only the internal dice paths
  // (rollDiceAction, commands/engine.ts) attach one. Hard-null it so a client can't
  // smuggle a fake check payload onto a text message that would still flip
  // ChatMessage into the dice-bubble renderer.
  const sentMessage = await dispatchMessage({
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
          .then(({ runAgent }) => runAgent(targetUserId, roomId, { triggeringUserId: userId, isPrivate: true, messageId: sentMessage.id }))
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
          const runs = await Promise.allSettled(roomBots.map(async (m) => {
            if (m.user.isBot && botActivationMode(m.user.botConfigJson) !== "manual" && (capturedContent.includes(`@${m.user.displayName}`) || capturedContent.includes(`@${m.nickname}`))) {
              await runAgent(m.userId, capturedRoomId, { triggeringUserId: capturedUserId, isPrivate: false, messageId: sentMessage.id });
            }
          }));
          for (const run of runs) {
            if (run.status === "rejected") console.error("[sendMessageAction] Mentioned bot failed:", run.reason);
          }
        })
        .catch((err) => console.error("[sendMessageAction] Failed to trigger AI agent (mention):", err));
    }
  }

  return { success: true };
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
): Promise<Done> {
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return noRoomAccess();
  // Server Actions receive raw JSON: `faces`/`count` are not guaranteed to be
  // the numbers the TS signature promises. Reject before touching the roller,
  // where a hostile faces value (> 2^32) would spin the rejection loop forever.
  if (!isDiceSpec(faces, count)) {
    const t = await getTranslations("roomActions");
    return { success: false, error: t("errorInvalidDice") };
  }
  await dispatchDiceRoll(roomId, access.userId, faces, count, hidden, channelPartnerId);
  return { success: true };
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
): Promise<Done> {
  const access = await tryRoomAccess(roomId, true);
  if (!access) return noRoomAccess();
  const { userId: hostId } = access;

  // Reject anything the modal shouldn't have produced. These rules now live in
  // timeline-payload.ts so the event module gates its own writes with the same
  // ones rather than its own (non-)validation.
  const clean = sanitizeTimelineDivider(data);
  if (!clean) return { success: false, error: (await getTranslations("timeline"))("errorInvalidPayload") };

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
): Promise<Done> {
  if (!(await tryRoomAccess(roomId, true))) return noRoomAccess();

  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!row || row.roomId !== roomId || row.type !== "system" || row.systemKind !== "timeline-divider") {
    return { success: false, error: (await getTranslations("timeline"))("errorNotDivider") };
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
  targetUserId?: number,
  origin?: string,
): Promise<CommandResult> {
  const session = await auth();
  const callerId = session ? parseInt(session.user.id) : NaN;

  // Signed out, acting as another user, or not a writable member: the same
  // `{ success, error }` shape the engine returns, so the caller's existing
  // "指令错误" rendering covers these too.
  if (callerId !== userId || !(await tryRoomAccess(roomId, false, { requireWritable: true }))) {
    const denied = await noRoomAccess();
    return { ...denied, isCommand: true };
  }

  return await executeCommand(roomId, userId, content, { isPrivate, targetUserId, origin });
}

// --- DM/Conversation Actions ---

export async function markDMReadAction(roomId: number, senderUserId: number): Promise<Done> {
  const access = await tryRoomAccess(roomId, false);
  if (!access) return noRoomAccess();
  const { userId } = access;

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
  return { success: true };
}

// --- History loading ---
// (No unbounded full-history fetch here on purpose: the page query and
// loadMoreMessagesAction / catchUpMessagesAction are all limit-bounded, and
// every exported "use server" function is callable by any authenticated
// member with a crafted POST.)

export async function loadMoreMessagesAction(roomId: number, beforeMessageId: number, limit = HISTORY_PAGE_LIMIT) {
  const { userId, isHost } = await checkRoomAccess(roomId, false);
  // Client-supplied paging values are untrusted: clamp instead of forwarding
  // `limit: 1e9` (or a negative/NaN value) straight into the query.
  const take = Number.isSafeInteger(limit) && limit > 0
    ? Math.min(limit, HISTORY_PAGE_LIMIT_MAX)
    : HISTORY_PAGE_LIMIT;
  const before = Number.isSafeInteger(beforeMessageId) && beforeMessageId > 0 ? beforeMessageId : Number.MAX_SAFE_INTEGER;

  const results = await db
    .select()
    .from(messages)
    .where(and(messageVisibilityWhere(roomId, userId, isHost), lt(messages.id, before)))
    .orderBy(desc(messages.id))
    .limit(take);

  return results.reverse();
}

/**
 * Reconnect catch-up: everything visible to this user newer than the last
 * message the client saw before its SSE stream dropped.
 *
 * Paging contract (a bounded response must not hide the hole):
 * - Call 1: `sinceMessageId`, no upper bound → the NEWEST page of the gap.
 * - If `truncated`, call 2 passes the previous page's oldest id as
 *   `beforeMessageId`. The window becomes `(since, before)` — strictly OLDER —
 *   so each call walks backwards until `truncated` is false. The old code
 *   reused the oldest id as `since`, which re-fetched the same page forever.
 */
export interface CatchUpResult {
  messages: typeof messages.$inferSelect[];
  /** True when older visible messages remain inside the gap window. */
  truncated: boolean;
  /** Oldest id in this page — pass as `beforeMessageId` on the next call. */
  gapBeforeMessageId: number | null;
}

export async function catchUpMessagesAction(
  roomId: number,
  sinceMessageId: number,
  beforeMessageId?: number | null,
  limit = CATCH_UP_LIMIT,
): Promise<CatchUpResult> {
  const { userId, isHost } = await checkRoomAccess(roomId, false);
  const take = Number.isSafeInteger(limit) && limit > 0
    ? Math.min(limit, CATCH_UP_LIMIT_MAX)
    : CATCH_UP_LIMIT;
  const safeSince = Number.isSafeInteger(sinceMessageId) && sinceMessageId > 0 ? sinceMessageId : 0;
  const before = Number.isSafeInteger(beforeMessageId) && (beforeMessageId as number) > 0
    ? (beforeMessageId as number)
    : null;

  const window = before != null
    ? and(messageVisibilityWhere(roomId, userId, isHost), gt(messages.id, safeSince), lt(messages.id, before))
    : and(messageVisibilityWhere(roomId, userId, isHost), gt(messages.id, safeSince));

  const results = await db
    .select()
    .from(messages)
    .where(window)
    .orderBy(desc(messages.id))
    .limit(take);

  const ordered = results.reverse();
  // A full page does not prove a gap by itself; probe for one more visible row
  // inside the same window so `truncated` is a fact, not a guess.
  let truncated = false;
  if (results.length === take) {
    const oldest = ordered[0]?.id;
    if (oldest != null) {
      const [older] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(messageVisibilityWhere(roomId, userId, isHost), gt(messages.id, safeSince), lt(messages.id, oldest)))
        .limit(1);
      truncated = !!older;
    }
  }

  return {
    messages: ordered,
    truncated,
    gapBeforeMessageId: truncated ? (ordered[0]?.id ?? null) : null,
  };
}
