"use server";

import { db, sqlBool } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users, messages } from "@/db/schema";
import { eq, and, not, desc, inArray, count, sql, or } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sendMessageAction } from "./room";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";
import { broadcastToRoom } from "@/lib/events";

/**
 * createInventoryItemAction
 */
export async function createInventoryItemAction(
  roomId: number,
  data: {
    type: "clue" | "info" | "character" | "item";
    title: string;
    content: unknown;
    imageUrl?: string;
  }
) {
  const { userId } = await checkRoomAccess(roomId, true);

  const [newItem] = await db.insert(inventoryItems).values({
    roomId,
    creatorId: userId,
    type: data.type,
    title: data.title,
    contentJson: JSON.stringify(data.content),
    imageUrl: data.imageUrl || null,
  }).returning();

  revalidatePath(`/rooms/${roomId}`);
  return newItem;
}

/**
 * updateInventoryItemAction (Host only).
 * Edits the canonical inventory item. Because backpacks/clues are read through the
 * inventoryDistributions -> item relation, the edit propagates to every recipient's
 * already-distributed copy. A real-time event makes open inventory panels reload.
 */
export async function updateInventoryItemAction(
  roomId: number,
  itemId: number,
  data: {
    type?: "clue" | "info" | "character" | "item";
    title: string;
    content: unknown;
    imageUrl?: string | null;
  }
) {
  await checkRoomAccess(roomId, true);

  // Verify item belongs to room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw new Error("Item not found");
  if (item.roomId !== roomId) throw new Error("Item room mismatch");

  const [updated] = await db
    .update(inventoryItems)
    .set({
      ...(data.type ? { type: data.type } : {}),
      title: data.title,
      contentJson: JSON.stringify(data.content),
      // Only overwrite imageUrl when explicitly provided (undefined = leave as-is)
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
    })
    .where(eq(inventoryItems.id, itemId))
    .returning();

  // Live-sync: notify all room subscribers so open inventory panels reload the edited item.
  broadcastToRoom(roomId, { type: "inventory_updated", itemId });

  revalidatePath(`/rooms/${roomId}`);
  return updated;
}

/**
 * distributeItemAction
 */
export async function distributeItemAction(
  roomId: number,
  itemId: number,
  toUserId: number | "all"
) {
  const { userId: fromUserId } = await checkRoomAccess(roomId, true);

  // Verify that the item exists and belongs to the room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw new Error("Item not found");
  if (item.roomId !== roomId) throw new Error("Item room mismatch");

  let targetUserIds: number[] = [];
  if (toUserId === "all") {
    // Exclude the host themselves from "all" distribution
    const members = await db
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(and(
        eq(roomMembers.roomId, roomId),
        not(eq(roomMembers.userId, fromUserId))
      ));
    targetUserIds = members.map((m: { userId: number }) => m.userId);
  } else {
    // Verify recipient is a member of the room
    const [recipientMember] = await db.select().from(roomMembers).where(
      and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, toUserId))
    );
    if (!recipientMember) throw new Error("Recipient is not a member of this room");
    
    targetUserIds = [toUserId];
  }

  if (targetUserIds.length === 0) return;

  // Filter out users who already have this item
  const existing = await db
    .select({ toUserId: inventoryDistributions.toUserId })
    .from(inventoryDistributions)
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.itemId, itemId),
        inArray(inventoryDistributions.toUserId, targetUserIds)
      )
    );
  const existingUserIds = new Set(existing.map((e) => e.toUserId));
  targetUserIds = targetUserIds.filter((id) => !existingUserIds.has(id));

  const t = await getTranslations("inventoryActions");

  if (targetUserIds.length === 0) {
    // Notify host that everyone already has it
    const kpSummary = toUserId === "all"
      ? t("alreadyHadAll", { title: item?.title })
      : t("alreadyHadOne", { title: item?.title });
    await sendMessageAction(roomId, kpSummary, "system", undefined, true);
    return;
  }

  const values = targetUserIds.map((tid) => ({
    roomId,
    itemId,
    fromUserId,
    toUserId: tid,
    action: "created" as const,
  }));

  // Perform DB insertion and user lookup within transaction
  const recipients = await db.transaction(async (tx) => {
    await tx.insert(inventoryDistributions).values(values);
    return await tx
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(inArray(users.id, targetUserIds));
  });

  // Prepare notification promises
  const promises: Promise<unknown>[] = [];

  // 1. Send targeted "Receipt" notification to each player (ONLY they see it)
  for (const tid of targetUserIds) {
    promises.push(
      sendMessageAction(
        roomId,
        t("receivedNew", { title: item?.title }),
        "system",
        undefined,
        true, // isPrivate
        tid   // targetUserId (Routes strictly to recipient)
      )
    );
  }

  // 2. Send "Log" notification to KP/Host (ONLY Host/Sender sees it)
  const kpSummary = toUserId === "all" 
    ? t("distributedAll", { title: item?.title })
    : t("distributedOne", { recipient: recipients[0]?.name || t("defaultPlayer"), title: item?.title });
  
  promises.push(sendMessageAction(roomId, kpSummary, "system", undefined, true)); // No targetUserId -> visible to Sender & Host

  // Execute notifications in parallel
  await Promise.all(promises);

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * shareItemAction
 */
export async function shareItemAction(
  roomId: number,
  itemId: number,
  toUserId: number
) {
  const t = await getTranslations("inventoryActions");
  const { userId: fromUserId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const session = await auth();
  const senderName = session?.user?.name || t("defaultPlayer");

  // Verify that the item exists and belongs to the room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw new Error("Item not found");
  if (item.roomId !== roomId) throw new Error("Item room mismatch");

  // Verify recipient is a member of the room
  const [recipientMember] = await db.select().from(roomMembers).where(
    and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, toUserId))
  );
  if (!recipientMember) throw new Error("Recipient is not a member of this room");

  const [own] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.roomId, roomId),
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, fromUserId)
    )
  );
  if (!own) throw new Error("You don't have this item in this room");

  // Check if recipient already has it
  const [hasAlready] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.roomId, roomId),
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, toUserId)
    )
  );
  if (hasAlready) {
    throw new Error(t("alreadyOwned"));
  }

  await db.insert(inventoryDistributions).values({
    roomId,
    itemId,
    fromUserId,
    toUserId,
    action: "shared",
  });

  const [recipient] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, toUserId));
  const recipientName = recipient?.name || t("defaultTeammate");

  // 1. Notification to recipient (ONLY recipient sees it)
  await sendMessageAction(
    roomId,
    t("sharedReceived", { sender: senderName, title: item?.title }),
    "system",
    undefined,
    true,
    toUserId
  );

  // 2. Notification to sender & Host (GM sees what players share)
  await sendMessageAction(
    roomId,
    t("sharedSent", { title: item?.title, recipient: recipientName }),
    "system",
    undefined,
    true
  );

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * getMyInventory
 */
export async function getMyInventory(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  const raw = await db.query.inventoryDistributions.findMany({
    where: and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId)
    ),
    with: {
        item: true,
        sender: true
    },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  return raw.map((d) => ({
    ...d,
    fromUsername: d.sender?.displayName || d.sender?.username
  }));
}

/**
 * getRoomItems
 */
export async function getRoomItems(roomId: number) {
  await checkRoomAccess(roomId, true);

  return await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.roomId, roomId))
    .orderBy(desc(inventoryItems.createdAt));
}

/**
 * getDistributionHistory
 */
export async function getDistributionHistory(roomId: number) {
  await checkRoomAccess(roomId, true);

  const raw = await db.query.inventoryDistributions.findMany({
    where: eq(inventoryDistributions.roomId, roomId),
    with: {
        item: true,
        sender: true,
        recipient: true
    },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  return raw.map((d) => ({
    ...d,
    toUsername: d.recipient?.displayName || d.recipient?.username,
    fromUsername: d.sender?.displayName || d.sender?.username
  }));
}

/**
 * Mark all inventory items as viewed for a user in a room.
 * Called when the player opens their inventory panel.
 */
export async function markInventoryViewedAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  await db.update(inventoryDistributions)
    .set({ viewed: sqlBool(true) as unknown as boolean })
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        sql`${inventoryDistributions.viewed} = ${sqlBool(false)}`
      )
    );

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * Get unread inventory count for badge display.
 */
export async function getUnreadInventoryCountAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  const result = await db.select({ count: count() })
    .from(inventoryDistributions)
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        sql`${inventoryDistributions.viewed} = ${sqlBool(false)}`
      )
    );

  return (result[0]?.count as number) || 0;
}

/**
 * Delete an inventory item (Host only).
 * Cascades to delete all distribution records.
 */
export async function deleteInventoryItemAction(roomId: number, itemId: number) {
  await checkRoomAccess(roomId, true);

  // Verify item belongs to room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw new Error("Item not found");
  if (item.roomId !== roomId) throw new Error("Item room mismatch");

  await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * publishClueAction - Publish a clue (make it visible to players)
 * Creates distribution records for targeted users or public (toUserId=null for all)
 */
export async function publishClueAction(
  roomId: number,
  itemId: number,
  targetUserIds?: number[]
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  // Verify item exists and is a clue
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) throw new Error("Item not found");
  if (item.roomId !== roomId) throw new Error("Item room mismatch");
  if (item.type !== 'clue') throw new Error("Item is not a clue");

  const isPublic = !targetUserIds || targetUserIds.length === 0;
  const t = await getTranslations("inventoryActions");

  if (isPublic) {
    // Check if already public
    const [hasPublic] = await db.select().from(inventoryDistributions).where(
      and(eq(inventoryDistributions.itemId, itemId), sql`${inventoryDistributions.toUserId} IS NULL`)
    ).limit(1);

    if (!hasPublic) {
      await db.insert(inventoryDistributions).values({
        roomId,
        itemId,
        fromUserId: hostId,
        toUserId: null,
        action: 'created',
      });
    }

    // Broadcast as message
    const [msg] = await db.insert(messages).values({
      roomId,
      userId: hostId,
      nickname: "Host",
      content: `🃏 **${item.title}**\n\n${JSON.parse(item.contentJson)?.text || item.contentJson}${item.imageUrl ? `\n\n![clue](${item.imageUrl})` : ""}`,
      type: "clue",
      diceDetail: JSON.stringify({ itemId: item.id, type: 'clue', isPublic: true }),
      isPrivate: false,
    }).returning();

    broadcastToRoom(roomId, msg);
  } else {
    // Targeted clue - filter out users who already have it
    const existing = await db.select({ toUserId: inventoryDistributions.toUserId }).from(inventoryDistributions).where(
      and(eq(inventoryDistributions.itemId, itemId), inArray(inventoryDistributions.toUserId, targetUserIds))
    );
    const existingUserIds = new Set(existing.map((e: { toUserId: number | null }) => e.toUserId).filter(Boolean));
    const newTargetIds = targetUserIds.filter(id => !existingUserIds.has(id));

    if (newTargetIds.length > 0) {
      const rows = newTargetIds.map(uid => ({
        roomId,
        itemId,
        fromUserId: hostId,
        toUserId: uid,
        action: 'created' as const,
      }));
      await db.insert(inventoryDistributions).values(rows);
    }

    // Send targeted messages
    const content = JSON.parse(item.contentJson)?.text || item.contentJson;
    for (const uid of newTargetIds) {
      const [msg] = await db.insert(messages).values({
        roomId,
        userId: hostId,
        nickname: "Host",
        content: `🃏 **${item.title}**\n\n${content}${item.imageUrl ? `\n\n![clue](${item.imageUrl})` : ""}`,
        type: "clue",
        diceDetail: JSON.stringify({ itemId: item.id, type: 'clue', isPublic: false, visibleTo: newTargetIds }),
        isPrivate: true,
        targetUserId: uid,
      }).returning();

      broadcastToRoom(roomId, msg);
    }

    // Send host log
    if (newTargetIds.length > 0) {
      const recipients = await db.select({ name: users.displayName }).from(users).where(inArray(users.id, newTargetIds));
      const recipientNames = recipients.map(r => r.name).join(", ");
      const [hostMsg] = await db.insert(messages).values({
        roomId,
        userId: hostId,
        nickname: "Host",
        content: t("cluePushLog", { recipients: recipientNames || t("defaultPlayers"), title: item.title }),
        type: "system",
        isPrivate: true,
      }).returning();
      broadcastToRoom(roomId, hostMsg);
    }
  }

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * getUnifiedInventoryAction - Get all inventory items visible to the user, including clues
 */
export async function getUnifiedInventoryAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  // Get inventory items from distributions
  const distributions = await db.query.inventoryDistributions.findMany({
    where: and(
      eq(inventoryDistributions.roomId, roomId),
      or(
        sql`${inventoryDistributions.toUserId} IS NULL`, // public clues
        eq(inventoryDistributions.toUserId, userId)       // user's items
      )
    ),
    with: { item: true, sender: true },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  return distributions.map((d) => ({
    id: d.item.id,
    type: d.item.type,
    title: d.item.title,
    content: d.item.contentJson,
    imageUrl: d.item.imageUrl,
    creatorId: d.item.creatorId,
    createdAt: d.item.createdAt,
    distributionId: d.id,
    fromUserId: d.fromUserId,
    distributedAt: d.createdAt,
    fromUsername: d.sender?.displayName || d.sender?.username
  }));
}
