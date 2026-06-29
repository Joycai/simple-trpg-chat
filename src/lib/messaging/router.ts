/**
 * Central message router (server-side).
 *
 * Every persisted room message is created through `dispatchMessage`: callers
 * declare a semantic `audience` (see ./audience.ts) and the router derives the
 * stored fields, writes the row, and pushes it over SSE. No caller hand-builds
 * `isPrivate`/`targetUserId` for visibility anymore.
 *
 * `messageVisibilityWhere` is the single SQL predicate for "messages this viewer
 * may load", shared by every history query (initial render, pagination, etc.).
 */
import { db } from "@/db";
import { messages, type SystemKind } from "@/db/schema";
import { broadcastToRoom } from "@/lib/events";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { Audience } from "@/lib/messaging/audience";

export type MessageType = "text" | "dice" | "system" | "clue" | "image" | "sticker" | "check_request";

export interface DispatchParams {
  roomId: number;
  /** The sender (a player, host, or bot user id). */
  actorUserId: number;
  nickname: string;
  type: MessageType;
  audience: Audience;
  /** WHO (visibility): the targeted user — required for `dm`, `directed`, `recipient`. */
  targetUserId?: number | null;
  /**
   * WHERE (channel): the DM partner if this message was issued inside a DM, so it
   * renders in that DM rather than the public feed. Omit for public-feed messages.
   * For `dm` it defaults to `targetUserId` (the conversation partner).
   */
  channelPartnerId?: number | null;
  content: string;
  diceDetail?: string | null;
  /**
   * Subtype for `type === 'system'` messages — drives the UI's icon/tint
   * (success / error / room event / scene marker). Ignored for other types.
   */
  systemKind?: SystemKind | null;
}

/** `targetUserId` (WHO) is stored only for audiences that reference a specific user. */
function storedTarget(audience: Audience, targetUserId?: number | null): number | null {
  if (audience === "dm" || audience === "directed" || audience === "recipient") {
    return targetUserId ?? null;
  }
  return null;
}

/** `channelUserId` (WHERE): the DM partner this message belongs to, or null = public. */
function storedChannel(audience: Audience, targetUserId?: number | null, channelPartnerId?: number | null): number | null {
  // A dm conversation lives in the channel with its partner.
  if (audience === "dm") return channelPartnerId ?? targetUserId ?? null;
  // self / recipient may be issued inside a DM (carried explicitly); everyone/gm/
  // directed always render in the public feed.
  if (audience === "self" || audience === "recipient") return channelPartnerId ?? null;
  return null;
}

/**
 * Persist a message with the given audience and broadcast it to the room.
 * Returns the inserted row.
 */
export async function dispatchMessage(params: DispatchParams) {
  const { roomId, actorUserId, nickname, type, audience, content, diceDetail, systemKind } = params;

  const [row] = await db
    .insert(messages)
    .values({
      roomId,
      userId: actorUserId,
      targetUserId: storedTarget(audience, params.targetUserId),
      channelUserId: storedChannel(audience, params.targetUserId, params.channelPartnerId),
      nickname,
      content,
      type,
      systemKind: type === "system" ? (systemKind ?? null) : null,
      diceDetail: diceDetail ?? null,
      audience,
      // Legacy mirror — derived, never read for visibility.
      isPrivate: audience !== "everyone",
    })
    .returning();

  broadcastToRoom(roomId, row);
  return row;
}

/**
 * SQL predicate selecting every message in `roomId` that `viewerId` may see,
 * mirroring `canSee` from ./audience.ts. Used by all message-history queries.
 */
export function messageVisibilityWhere(roomId: number, viewerId: number, viewerIsHost: boolean): SQL {
  const visible = or(
    eq(messages.audience, "everyone"),
    and(eq(messages.audience, "self"), eq(messages.userId, viewerId)),
    // recipient: only the targeted user (NOT the actor).
    and(eq(messages.audience, "recipient"), eq(messages.targetUserId, viewerId)),
    and(
      inArray(messages.audience, ["directed", "dm"]),
      or(eq(messages.userId, viewerId), eq(messages.targetUserId, viewerId))
    ),
    viewerIsHost
      ? eq(messages.audience, "gm")
      : and(eq(messages.audience, "gm"), eq(messages.userId, viewerId))
  );
  return and(eq(messages.roomId, roomId), visible)!;
}
