"use server";

import { db, sqlBool } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users } from "@/db/schema";
import { eq, and, not, desc, inArray, count, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sendMessageAction } from "./room";
import { checkRoomAccess } from "@/lib/auth-helpers";

/**
 * createInventoryItemAction
 */
export async function createInventoryItemAction(
  roomId: number,
  data: {
    type: "info" | "character" | "item";
    title: string;
    content: any;
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
    targetUserIds = members.map((m: any) => m.userId);
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
  const existingUserIds = new Set(existing.map((e: any) => e.toUserId));
  targetUserIds = targetUserIds.filter((id) => !existingUserIds.has(id));

  if (targetUserIds.length === 0) {
    // Notify host that everyone already has it
    const kpSummary = toUserId === "all"
      ? `⚠️ 全体成员此前已拥有道具：【${item?.title}】，未重复发放`
      : `⚠️ 目标玩家此前已拥有道具：【${item?.title}】，未重复发放`;
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

  await db.insert(inventoryDistributions).values(values);

  const recipients = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, targetUserIds));

  // 1. Send targeted "Receipt" notification to each player (ONLY they see it)
  for (const tid of targetUserIds) {
    await sendMessageAction(
      roomId,
      `📦 您获得了新道具：【${item?.title}】`,
      "system",
      undefined,
      true, // isPrivate
      tid   // targetUserId (Routes strictly to recipient)
    );
  }

  // 2. Send "Log" notification to KP/Host (ONLY Host/Sender sees it)
  const kpSummary = toUserId === "all" 
    ? `📤 已向全体成员发放道具：【${item?.title}】`
    : `📤 已向 ${recipients[0]?.name || '玩家'} 发放道具：【${item?.title}】`;
  
  await sendMessageAction(roomId, kpSummary, "system", undefined, true); // No targetUserId -> visible to Sender & Host

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
  const { userId: fromUserId } = await checkRoomAccess(roomId, false);
  const session = await auth();
  const senderName = session?.user?.name || "玩家";

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
    throw new Error("该玩家已拥有此道具");
  }

  await db.insert(inventoryDistributions).values({
    roomId,
    itemId,
    fromUserId,
    toUserId,
    action: "shared",
  });

  const [recipient] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, toUserId));
  const recipientName = recipient?.name || "队友";

  // 1. Notification to recipient (ONLY recipient sees it)
  await sendMessageAction(
    roomId,
    `🤝 获得了来自 ${senderName} 分享的道具：【${item?.title}】`,
    "system",
    undefined,
    true,
    toUserId
  );

  // 2. Notification to sender & Host (GM sees what players share)
  await sendMessageAction(
    roomId,
    `📤 已将道具 【${item?.title}】 分享给 ${recipientName}`,
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

  return raw.map((d: any) => ({
    ...d,
    fromUsername: d.sender?.displayName || d.sender?.username
  }));
}

/**
 * getRoomItems
 */
export async function getRoomItems(roomId: number) {
  await checkRoomAccess(roomId, false);

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
  await checkRoomAccess(roomId, false);

  const raw = await db.query.inventoryDistributions.findMany({
    where: eq(inventoryDistributions.roomId, roomId),
    with: {
        item: true,
        sender: true,
        recipient: true
    },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  return raw.map((d: any) => ({
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
