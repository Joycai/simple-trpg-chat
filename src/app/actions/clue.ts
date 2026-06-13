"use server";

import { db } from "@/db";
import { clueCards, clueVisibility, messages, users } from "@/db/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { broadcastToRoom } from "@/lib/events";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";

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
  const { userId } = await checkRoomAccess(roomId, true);

  const [clue] = await db.insert(clueCards).values({
    roomId,
    creatorId: userId,
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
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  let clue: any;
  if (clueId) {
    const [existingClue] = await db.select().from(clueCards).where(eq(clueCards.id, clueId));
    if (!existingClue) throw new Error("Clue not found");
    if (existingClue.roomId !== roomId) throw new Error("Clue room mismatch");
    clue = existingClue;
  } else {
    const [newClue] = await db.insert(clueCards).values({
      roomId,
      creatorId: hostId,
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

  const t = await getTranslations("clueActions");

  // Broadcast as clue message
  let lastMsg: any;
  if (isPublic) {
    const [msg] = await db.insert(messages).values({
      roomId,
      userId: hostId,
      nickname: "Host",
      content: `🃏 **${title}**\n\n${content}${imageUrl ? `\n\n![${t("imageLabel")}](${imageUrl})` : ""}`,
      type: "clue",
      diceDetail: JSON.stringify({
        clueId: clue.id,
        isPublic: true,
        visibleTo: "all",
      }),
      isPrivate: false,
    }).returning();

    broadcastToRoom(roomId, msg);
    lastMsg = msg;
  } else {
    // For private clues, insert a targeted private message for each recipient
    for (const uid of targetUserIds!) {
      const [msg] = await db.insert(messages).values({
        roomId,
        userId: hostId,
        nickname: "Host",
        content: `🃏 **${title}**\n\n${content}${imageUrl ? `\n\n![${t("imageLabel")}](${imageUrl})` : ""}`,
        type: "clue",
        diceDetail: JSON.stringify({
          clueId: clue.id,
          isPublic: false,
          visibleTo: targetUserIds,
        }),
        isPrivate: true,
        targetUserId: uid,
      }).returning();

      broadcastToRoom(roomId, msg);
      lastMsg = msg;
    }

    // Send Host log summary
    const recipients = await db
      .select({ name: users.displayName })
      .from(users)
      .where(inArray(users.id, targetUserIds!));
    const recipientNames = recipients.map(r => r.name).join(", ");
    const [hostMsg] = await db.insert(messages).values({
      roomId,
      userId: hostId,
      nickname: "Host",
      content: t("cluePushLog", { recipients: recipientNames || t("defaultPlayers"), title }),
      type: "system",
      isPrivate: true,
    }).returning();
    broadcastToRoom(roomId, hostMsg);
  }

  revalidatePath(`/rooms/${roomId}`);
  return { clue, message: lastMsg };
}

/**
 * Get all clues visible to the current user in the room.
 * Returns clues where:
 * - visibility.userId IS NULL (public), OR
 * - visibility.userId matches the current user, OR
 * - the current user is the creator (always sees own clues)
 */
export async function getVisibleCluesAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  // 1. Get all clueIds in this room that are visible to the current user (either public or specific user)
  // We can select clueVisibility entries for this user / public, and join clueCards on roomId.
  const visibleVisibility = await db
    .select({ clueId: clueVisibility.clueId })
    .from(clueVisibility)
    .innerJoin(clueCards, eq(clueVisibility.clueId, clueCards.id))
    .where(
      and(
        eq(clueCards.roomId, roomId),
        or(
          isNull(clueVisibility.userId),
          eq(clueVisibility.userId, userId)
        )
      )
    );

  const clueIds = Array.from(new Set(visibleVisibility.map(v => v.clueId)));

  // 2. Fetch the corresponding clueCards (or clues created by this user in this room)
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
  if (!session) throw new Error("Not authenticated");

  const t = await getTranslations("clueActions");

  // Fetch the clue to determine roomId
  const [clue] = await db.select().from(clueCards).where(eq(clueCards.id, clueId));
  if (!clue) throw new Error(t("notFound"));

  // Verify that the caller is the host of the room where the clue exists
  const { userId: hostId } = await checkRoomAccess(clue.roomId, true);

  if (!targetUserIds || targetUserIds.length === 0) {
    throw new Error(t("mustSpecifyTarget"));
  }

  // Validate that all targetUserIds are members of the clue's room
  const { roomMembers: roomMembersTable } = await import("@/db/schema");
  const memberRows = await db.select({ userId: roomMembersTable.userId })
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.roomId, clue.roomId)));
  const memberSet = new Set(memberRows.map(m => m.userId));
  const invalidTargets = targetUserIds.filter(uid => !memberSet.has(uid));
  if (invalidTargets.length > 0) throw new Error(t("invalidTargets") || "One or more target users are not members of this room");

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

  // 3. Send targeted private system message to each player
  for (const uid of newTargetUserIds) {
    const [msg] = await db.insert(messages).values({
      roomId: clue.roomId,
      userId: hostId,
      nickname: "Host",
      content: t("clueReceived", { title: clue.title }),
      type: "system",
      isPrivate: true,
      targetUserId: uid,
    }).returning();

    broadcastToRoom(clue.roomId, msg);
  }

  // Send Host log summary
  const recipients = await db
    .select({ name: users.displayName })
    .from(users)
    .where(inArray(users.id, newTargetUserIds));
  const recipientNames = recipients.map(r => r.name).join(", ");
  const [hostMsg] = await db.insert(messages).values({
    roomId: clue.roomId,
    userId: hostId,
    nickname: "Host",
    content: t("cluePushLog", { recipients: recipientNames || t("defaultPlayers"), title: clue.title }),
    type: "system",
    isPrivate: true,
  }).returning();
  broadcastToRoom(clue.roomId, hostMsg);

  revalidatePath(`/rooms/${clue.roomId}`);
  return { clueId, revealedTo: newTargetUserIds };
}
