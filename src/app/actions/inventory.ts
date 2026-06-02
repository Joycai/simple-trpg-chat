"use server";

import { db } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users } from "@/db/schema";
import { eq, and, desc, inArray, aliasedTable } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sendMessageAction } from "./room";

/**
 * createInventoryItemAction
 * KP creates a template.
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
    throw new Error("Unauthorized: Only hosts can create items");
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
 * KP distributes to one or all players.
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

  // 1. Batch INSERT distributions
  const values = targetUserIds.map((tid) => ({
    roomId,
    itemId,
    fromUserId,
    toUserId: tid,
    action: "created" as const,
  }));

  if (values.length === 0) return;

  await db.insert(inventoryDistributions).values(values);

  // 2. Send private notifications — differentiated by sender vs recipient
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));

  // Get recipient display names for KP notification
  const recipients = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, targetUserIds));

  for (const tid of targetUserIds) {
    const recipient = recipients.find((r) => r.id === tid);
    // Recipient sees receipt notification
    await sendMessageAction(roomId, `📦 获得了新道具：【${item?.title}】`, "system", undefined, true, tid);
  }

  // Send KP a separate notification showing who received it
  if (targetUserIds.length === 1) {
    const name = recipients[0]?.name || `玩家 #${targetUserIds[0]}`;
    await sendMessageAction(roomId, `📤 已向 ${name} 发放道具：【${item?.title}】`, "system", undefined, true, fromUserId);
  } else {
    await sendMessageAction(roomId, `📤 已向全体成员发放道具：【${item?.title}】`, "system", undefined, true, fromUserId);
  }

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * shareItemAction
 * Player shares an item with another player.
 */
export async function shareItemAction(
  roomId: number,
  itemId: number,
  toUserId: number
) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const fromUserId = parseInt((session.user as any).id);

  // 1. Verify owner has it
  const [own] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, fromUserId)
    )
  );
  if (!own) throw new Error("You don't have this item");

  // 2. Record distribution
  await db.insert(inventoryDistributions).values({
    roomId,
    itemId,
    fromUserId,
    toUserId,
    action: "shared",
  });

  // 3. Send private notifications
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));

  // Recipient sees shared notification
  await sendMessageAction(roomId, `🤝 队友分享了一个道具：【${item?.title}】`, "system", undefined, true, toUserId);

  // Sender gets a confirmation
  await sendMessageAction(roomId, `📤 已向玩家分享道具：【${item?.title}】`, "system", undefined, true, fromUserId);

  revalidatePath(`/rooms/${roomId}`);
}

/**
 * getMyInventory
 * Fetch distributions with item data for current user.
 */
export async function getMyInventory(roomId: number) {
  const session = await auth();
  if (!session) return [];

  const userId = parseInt((session.user as any).id);

  // We use findMany with relations for cleaner UI mapping
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
 * getRoomItems (GM only)
 */
export async function getRoomItems(roomId: number) {
  return await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.roomId, roomId))
    .orderBy(desc(inventoryItems.createdAt));
}

/**
 * getDistributionHistory (GM only)
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
