"use server";

import { db } from "@/db";
import { clueCards, clueVisibility, messages } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { broadcastToRoom } from "@/lib/events";

/**
 * Create a clue card with optional visibility targets.
 * If targetUserIds is empty/undefined, the clue is created but NOT revealed yet.
 * Host only.
 */
export async function createClueAction(
  roomId: number,
  title: string,
  content: string,
  imageUrl?: string,
  targetUserIds?: number[]
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Only host can create clues");
  }

  const [clue] = await db.insert(clueCards).values({
    roomId,
    creatorId: parseInt((session.user as any).id),
    title,
    content,
    imageUrl: imageUrl || null,
  }).returning();

  // If targets are specified, create visibility records
  if (targetUserIds && targetUserIds.length > 0) {
    const rows = targetUserIds.map(uid => ({
      clueId: clue.id,
      userId: uid,
    }));
    await db.insert(clueVisibility).values(rows);
  }

  return clue;
}

/**
 * Push a clue to the channel (broadcast as a message).
 * Creates the clue AND reveals it, then broadcasts via SSE.
 * Supports: public (no targets) or targeted (specific players).
 *
 * @param targetUserIds - if empty/undefined, clue is public (visible to all)
 */
export async function pushClueToChannelAction(
  roomId: number,
  title: string,
  content: string,
  imageUrl?: string,
  targetUserIds?: number[]
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Only host can push clues");
  }

  const [clue] = await db.insert(clueCards).values({
    roomId,
    creatorId: parseInt((session.user as any).id),
    title,
    content,
    imageUrl: imageUrl || null,
  }).returning();

  const isPublic = !targetUserIds || targetUserIds.length === 0;

  if (isPublic) {
    // Reveal to all (NULL userId = public)
    await db.insert(clueVisibility).values({
      clueId: clue.id,
      userId: null,
    });
  } else {
    // Reveal to specific players
    const rows = targetUserIds.map(uid => ({
      clueId: clue.id,
      userId: uid,
    }));
    await db.insert(clueVisibility).values(rows);
  }

  // Broadcast as clue message
  const [msg] = await db.insert(messages).values({
    roomId,
    userId: parseInt((session.user as any).id),
    nickname: (session.user as any).name || "Host",
    content: `🃏 **${title}**\n\n${content}${imageUrl ? `\n\n![线索图片](${imageUrl})` : ""}`,
    type: "clue",
    diceDetail: JSON.stringify({
      clueId: clue.id,
      isPublic,
      visibleTo: isPublic ? "all" : targetUserIds,
    }),
  }).returning();

  broadcastToRoom(roomId, msg);
  return { clue, message: msg };
}

/**
 * Get all clues visible to the current user in the room.
 * Returns clues where visibility.userId IS NULL (public)
 * OR visibility.userId matches the current user.
 */
export async function getVisibleCluesAction(roomId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  const rows = await db
    .select({
      clue: clueCards,
      visibility: clueVisibility,
    })
    .from(clueCards)
    .innerJoin(clueVisibility, eq(clueCards.id, clueVisibility.clueId))
    .where(
      and(
        eq(clueCards.roomId, roomId),
        or(
          isNull(clueVisibility.userId),
          eq(clueVisibility.userId, userId)
        )
      )
    )
    .orderBy(clueCards.createdAt);

  return rows;
}

/**
 * Reveal an existing clue to one or more players.
 * Used when Host wants to grant access to a previously created clue.
 */
export async function revealClueToPlayersAction(
  clueId: number,
  targetUserIds: number[]
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Only host can reveal clues");
  }

  if (!targetUserIds || targetUserIds.length === 0) {
    throw new Error("Must specify at least one target user");
  }

  const rows = targetUserIds.map(uid => ({
    clueId,
    userId: uid,
  }));
  await db.insert(clueVisibility).values(rows);

  return { clueId, revealedTo: targetUserIds };
}
