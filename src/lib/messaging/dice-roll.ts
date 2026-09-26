import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { dispatchMessage } from "@/lib/messaging/router";
import type { Audience } from "@/lib/messaging/audience";
import { rollDice } from "@/lib/commands/dice";
import { resolveAnnouncer, attachAnnouncer, scheduleQuip } from "@/lib/ai/dice-announcer";

/**
 * Roll `count`d`faces` for `userId` and post the result as a `dice` message.
 * The caller has already authorized `userId` for the room — this is the shared
 * body of `rollDiceAction` (🎲 panel) and a check response's plain roll.
 */
export async function dispatchDiceRoll(
  roomId: number,
  userId: number,
  faces: number,
  count: number,
  hidden: boolean = false,
  channelPartnerId?: number
) {
  const { results, sum, notation } = rollDice(faces, count);
  const detail = JSON.stringify({ dice: `d${faces}`, count, results, sum, notation });
  const content = `🎲 ${notation}: [${results.join(", ")}] = ${sum}`;

  const [member] = await db
    .select({ nickname: roomMembers.nickname })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  const nickname = member?.nickname || "SYSTEM";

  const audience: Audience = hidden ? "self" : channelPartnerId ? "dm" : "everyone";

  // 投娘 (dice announcer) tag — see docs/design/dice-announcer.md. Mirrors the
  // injection in commands/command-message.ts's emitCommandMessage; this is the 🎲 panel's own
  // dispatch path, which doesn't go through executeCommand.
  const announcer = await resolveAnnouncer(roomId, userId);
  const finalDetail = announcer ? attachAnnouncer(detail, announcer) : detail;

  const msg = await dispatchMessage({
    roomId,
    actorUserId: userId,
    nickname,
    type: "dice",
    audience,
    // dm targets the partner (WHO); a hidden roll has no audience target. Either way
    // channelPartnerId places it in the right channel (current DM, or public).
    targetUserId: audience === "dm" ? channelPartnerId : undefined,
    channelPartnerId: channelPartnerId ?? undefined,
    content: hidden ? `🔒 ${content}` : content,
    diceDetail: finalDetail,
  });

  if (announcer && msg) {
    scheduleQuip({
      roomId,
      messageId: msg.id,
      announcer,
      roll: { rollerNickname: nickname, notation, resultText: content, hidden },
    }).catch((err) => console.error("[dice-announcer] scheduleQuip failed:", err));
  }

  return msg;
}
