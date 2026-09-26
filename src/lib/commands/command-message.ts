import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { dispatchMessage, type MessageType } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import type { SystemKind } from "@/db/schema";
import { resolveAnnouncer, attachAnnouncer, scheduleQuip, type RollSummary } from "@/lib/ai/dice-announcer";
import type { CommandContext } from "./command-types";

/** Tag a diceDetail JSON string with proxy attribution. No-op when not proxied. */
export function attachProxy(detailJson: string, proxiedBy?: { userId: number; nickname: string }): string {
  if (!proxiedBy) return detailJson;
  try {
    const obj = JSON.parse(detailJson) as Record<string, unknown>;
    obj.proxiedByUserId = proxiedBy.userId;
    obj.proxiedByNickname = proxiedBy.nickname;
    return JSON.stringify(obj);
  } catch {
    return detailJson;
  }
}

/**
 * Resolve the audience of a command's feedback message.
 * - "self": only the issuing user sees it, regardless of channel (.help, .st, .rh).
 * - "channel": follows where the command was issued — public stays public (everyone),
 *   a DM keeps the result between the two participants (dm).
 */
export function visibilityFor(
  ctx: CommandContext | undefined,
  userId: number,
  mode: "self" | "channel"
): { audience: Audience; targetUserId?: number; channelPartnerId?: number } {
  if (mode === "self") {
    // Self-visible, but stays in the channel it was issued in: carry the DM partner
    // as the channel (so e.g. .rh in a DM renders in that DM, not the public feed).
    return { audience: "self", channelPartnerId: ctx?.isPrivate ? ctx.targetUserId : undefined };
  }
  if (ctx?.isPrivate && ctx.targetUserId) {
    return { audience: "dm", targetUserId: ctx.targetUserId };
  }
  return { audience: "everyone" };
}

/**
 * Emit a command-feedback message through the central router, carrying the
 * issuer's nickname (dice/check results read as "<player> 🎲 …").
 *
 * For `type === "dice"` messages, also applies the room's 投娘 (dice
 * announcer) tag when one is configured — see docs/design/dice-announcer.md.
 * `rollSummary` carries the roll-specific fields (notation/grade/skillName)
 * each dice call site already has in scope; omitted for non-dice messages.
 */
export async function emitCommandMessage(
  roomId: number,
  userId: number,
  content: string,
  type: MessageType,
  vis: { audience: Audience; targetUserId?: number; channelPartnerId?: number },
  diceDetail?: string,
  systemKind?: SystemKind | null,
  rollSummary?: Omit<RollSummary, "rollerNickname" | "hidden">
) {
  const [m] = await db
    .select({ nickname: roomMembers.nickname })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  const nickname = m?.nickname || "SYSTEM";

  let finalDetail = diceDetail;
  const announcer = type === "dice" && diceDetail ? await resolveAnnouncer(roomId, userId) : null;
  if (announcer && diceDetail) {
    finalDetail = attachAnnouncer(diceDetail, announcer);
  }

  const msg = await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname,
    type,
    audience: vis.audience,
    targetUserId: vis.targetUserId,
    channelPartnerId: vis.channelPartnerId,
    content,
    diceDetail: finalDetail,
    systemKind,
  });

  if (announcer && msg && rollSummary) {
    scheduleQuip({
      roomId,
      messageId: msg.id,
      announcer,
      roll: { ...rollSummary, rollerNickname: nickname, hidden: vis.audience === "self" },
    }).catch((err) => console.error("[dice-announcer] scheduleQuip failed:", err));
  }

  return msg;
}
