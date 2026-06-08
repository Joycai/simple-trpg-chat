"use server";

import { db } from "@/db";
import { clueCards, clueVisibility, messages } from "@/db/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
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

  revalidatePath(`/rooms/${roomId}`);
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
  targetUserIds?: number[],
  clueId?: number
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Only host can push clues");
  }

  let clue: any;
  if (clueId) {
    const [existingClue] = await db.select().from(clueCards).where(eq(clueCards.id, clueId));
    if (!existingClue) throw new Error("Clue not found");
    clue = existingClue;
  } else {
    const [newClue] = await db.insert(clueCards).values({
      roomId,
      creatorId: parseInt((session.user as any).id),
      title,
      content,
      imageUrl: imageUrl || null,
    }).returning();
    clue = newClue;
  }

  const isPublic = !targetUserIds || targetUserIds.length === 0;

  if (isPublic) {
    // Check if it already has public visibility (userId IS NULL)
    const [hasPublic] = await db
      .select()
      .from(clueVisibility)
      .where(
        and(
          eq(clueVisibility.clueId, clue.id),
          isNull(clueVisibility.userId)
        )
      )
      .limit(1);

    if (!hasPublic) {
      // Reveal to all (NULL userId = public)
      await db.insert(clueVisibility).values({
        clueId: clue.id,
        userId: null,
      });
    }
  } else {
    // Reveal to specific players, filtering out ones who already have visibility
    const existingVisibility = await db
      .select({ userId: clueVisibility.userId })
      .from(clueVisibility)
      .where(
        and(
          eq(clueVisibility.clueId, clue.id),
          inArray(clueVisibility.userId, targetUserIds)
        )
      );
    const existingUserIds = new Set(existingVisibility.map((v: any) => v.userId).filter(Boolean));
    const newTargetUserIds = targetUserIds.filter(uid => !existingUserIds.has(uid));

    if (newTargetUserIds.length > 0) {
      const rows = newTargetUserIds.map(uid => ({
        clueId: clue.id,
        userId: uid,
      }));
      await db.insert(clueVisibility).values(rows);
    }
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
 * Returns clues where:
 * - visibility.userId IS NULL (public), OR
 * - visibility.userId matches the current user, OR
 * - the current user is the creator (always sees own clues)
 */
export async function getVisibleCluesAction(roomId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  // 1. Get all clueIds that are visible to the current user (either public or specific user)
  const visibleVisibility = await db
    .select({ clueId: clueVisibility.clueId })
    .from(clueVisibility)
    .where(
      or(
        isNull(clueVisibility.userId),
        eq(clueVisibility.userId, userId)
      )
    );

  const clueIds = Array.from(new Set(visibleVisibility.map(v => v.clueId)));

  // 2. Fetch the corresponding clueCards (or clues created by this user)
  const conditions = [eq(clueCards.roomId, roomId)];
  if (clueIds.length > 0) {
    conditions.push(
      or(
        eq(clueCards.creatorId, userId),
        inArray(clueCards.id, clueIds)
      )!
    );
  } else {
    conditions.push(eq(clueCards.creatorId, userId));
  }

  const rows = await db
    .select()
    .from(clueCards)
    .where(and(...conditions))
    .orderBy(clueCards.createdAt);

  return rows.map(clue => ({ clue }));
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

  // 1. Check if clue is already public (NULL userId)
  const [isPublic] = await db
    .select()
    .from(clueVisibility)
    .where(
      and(
        eq(clueVisibility.clueId, clueId),
        isNull(clueVisibility.userId)
      )
    )
    .limit(1);

  if (isPublic) {
    return { clueId, revealedTo: [] };
  }

  // 2. Filter out users who already have visibility
  const existingVisibility = await db
    .select({ userId: clueVisibility.userId })
    .from(clueVisibility)
    .where(
      and(
        eq(clueVisibility.clueId, clueId),
        inArray(clueVisibility.userId, targetUserIds)
      )
    );
  
  const existingUserIds = new Set(existingVisibility.map((v: any) => v.userId).filter(Boolean));
  const newTargetUserIds = targetUserIds.filter(uid => !existingUserIds.has(uid));

  if (newTargetUserIds.length === 0) {
    return { clueId, revealedTo: [] };
  }

  const rows = newTargetUserIds.map(uid => ({
    clueId,
    userId: uid,
  }));
  await db.insert(clueVisibility).values(rows);

  return { clueId, revealedTo: newTargetUserIds };
}
