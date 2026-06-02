"use server";

import { db } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users, rooms } from "@/db/schema";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sendMessageAction } from "./room";

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
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Unauthorized");
  }

  const [newItem] = await db.insert(inventoryItems).values({
    roomId,
    creatorId: parseInt((session.user as any).id),
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
  const session = await auth();
  if (!session || (session.user as any).role !== "host") {
    throw new Error("Unauthorized");
  }

  const fromUserId = parseInt((session.user as any).id);

  let targetUserIds: number[] = [];
  if (toUserId === "all") {
    const members = await db
      .select({ userId: roomMembers.userId })
      .from(roomMembers)
      .where(eq(roomMembers.roomId, roomId));
    targetUserIds = members.map((m) => m.userId);
  } else {
    targetUserIds = [toUserId];
  }

  const values = targetUserIds.map((tid) => ({
    roomId,
    itemId,
    fromUserId,
    toUserId: tid,
    action: "created" as const,
  }));

  if (values.length === 0) return;
  await db.insert(inventoryDistributions).values(values);

  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
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
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const fromUserId = parseInt((session.user as any).id);
  const senderName = (session.user as any).name || "玩家";

  const [own] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, fromUserId)
    )
  );
  if (!own) throw new Error("You don't have this item");

  await db.insert(inventoryDistributions).values({
    roomId,
    itemId,
    fromUserId,
    toUserId,
    action: "shared",
  });

  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
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
  const session = await auth();
  if (!session) return [];
  const userId = parseInt((session.user as any).id);

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

  return raw.map(d => ({
    ...d,
    fromUsername: d.sender?.displayName || d.sender?.username
  }));
}

/**
 * getRoomItems
 */
export async function getRoomItems(roomId: number) {
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
  const raw = await db.query.inventoryDistributions.findMany({
    where: eq(inventoryDistributions.roomId, roomId),
    with: {
        item: true,
        sender: true,
        recipient: true
    },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  return raw.map(d => ({
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
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = parseInt((session.user as any).id);

  await db.update(inventoryDistributions)
    .set({ viewed: true })
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        eq(inventoryDistributions.viewed, false)
      )
    );

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * Get unread inventory count for badge display.
 */
export async function getUnreadInventoryCountAction(roomId: number) {
  const session = await auth();
  if (!session) return 0;

  const userId = parseInt((session.user as any).id);

  const result = await db.select({ count: count() })
    .from(inventoryDistributions)
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        eq(inventoryDistributions.viewed, false)
      )
    );

  return (result[0]?.count as number) || 0;
}
