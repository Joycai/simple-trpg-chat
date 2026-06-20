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
import { messages } from "@/db/schema";
import { broadcastToRoom } from "@/lib/events";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { Audience } from "@/lib/messaging/audience";

export type MessageType = "text" | "dice" | "system" | "clue" | "image" | "check_request";

export interface DispatchParams {
  roomId: number;
  /** The sender (a player, host, or bot user id). */
  actorUserId: number;
  nickname: string;
  type: MessageType;
  audience: Audience;
  /** Required for `dm` and `directed`; ignored for other audiences. */
  targetUserId?: number | null;
  content: string;
  diceDetail?: string | null;
}

/** `targetUserId` is only meaningful for audiences that point at a specific user. */
function storedTarget(audience: Audience, targetUserId?: number | null): number | null {
  if (audience === "dm" || audience === "directed") return targetUserId ?? null;
  return null;
}

/**
 * Persist a message with the given audience and broadcast it to the room.
 * Returns the inserted row.
 */
export async function dispatchMessage(params: DispatchParams) {
  const { roomId, actorUserId, nickname, type, audience, content, diceDetail } = params;

  const [row] = await db
    .insert(messages)
    .values({
      roomId,
      userId: actorUserId,
      targetUserId: storedTarget(audience, params.targetUserId),
      nickname,
      content,
      type,
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
