"use server";

import { db } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users } from "@/db/schema";
import { eq, and, not, desc, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { checkRoomAccess, tryRoomAccess } from "@/lib/auth/room-access";
import { countUnreadInventory } from "@/lib/room/initial-snapshot";
import { getTranslations } from "next-intl/server";
import { broadcastToRoom } from "@/lib/server/events";
import { dispatchMessage } from "@/lib/messaging/router";
import { buildDispatchPayload, buildReceiptPayload } from "@/lib/messaging/dispatch-payload";
import { shareItemCore } from "@/lib/room/inventory-share";

type Fail = { success: false; error: string };
type Done = { success: true } | Fail;

async function noAccess(): Promise<Fail> {
  return { success: false, error: (await getTranslations("roomActions"))("errorNoAccess") };
}

async function itemNotFound(): Promise<Fail> {
  return { success: false, error: (await getTranslations("inventoryActions"))("errorItemNotFound") };
}

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
    source?: string | null;
    visibility?: string | null;
    relation?: string | null;
    category?: string | null;
    quantity?: number | null;
  }
): Promise<Done> {
  const access = await tryRoomAccess(roomId, true);
  if (!access) return noAccess();
  const { userId } = access;

  await db.insert(inventoryItems).values({
    roomId,
    creatorId: userId,
    type: data.type,
    title: data.title,
    contentJson: JSON.stringify(data.content),
    imageUrl: data.imageUrl || null,
    source: data.source ?? null,
    visibility: data.visibility ?? null,
    relation: data.relation ?? null,
    category: data.category ?? null,
    quantity: data.quantity ?? null,
  });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * updateInventoryItemAction (Host only).
 * Edits the canonical inventory item. Because backpacks/clues are read through the
 * inventoryDistributions -> item relation, the edit propagates to every recipient's
 * already-distributed copy. A real-time event makes open inventory panels reload.
 *
 * Recipients who had already viewed their copy are re-flagged (`updated = true`,
 * `viewed = false`) and notified — just like a first-time hand-off — so the change
 * doesn't slip by silently. Holders who haven't opened the item yet keep their
 * existing "new" flag (they'll see the edited content on first open anyway).
 */
export async function updateInventoryItemAction(
  roomId: number,
  itemId: number,
  data: {
    type?: "clue" | "info" | "character" | "item";
    title: string;
    content: unknown;
    imageUrl?: string | null;
    source?: string | null;
    visibility?: string | null;
    relation?: string | null;
    category?: string | null;
    quantity?: number | null;
  }
): Promise<Done> {
  const access = await tryRoomAccess(roomId, true);
  if (!access) return noAccess();
  const { userId: hostId } = access;

  // Verify item belongs to room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item || item.roomId !== roomId) return itemNotFound();

  const [updated] = await db
    .update(inventoryItems)
    .set({
      ...(data.type ? { type: data.type } : {}),
      title: data.title,
      contentJson: JSON.stringify(data.content),
      // Only overwrite imageUrl when explicitly provided (undefined = leave as-is)
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.source !== undefined ? { source: data.source } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.relation !== undefined ? { relation: data.relation } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
    })
    .where(eq(inventoryItems.id, itemId))
    .returning();

  // Re-flag already-viewed recipient copies as "updated" (excluding the editing host
  // and public clue rows). Unviewed copies stay "new" and aren't re-notified.
  const reflagged = await db
    .update(inventoryDistributions)
    .set({ updated: true, viewed: false })
    .where(
      and(
        eq(inventoryDistributions.itemId, itemId),
        not(eq(inventoryDistributions.toUserId, hostId)),
        sql`${inventoryDistributions.toUserId} IS NOT NULL`,
        sql`${inventoryDistributions.viewed} = ${true}`
      )
    )
    .returning({ toUserId: inventoryDistributions.toUserId });

  const notifyUserIds = reflagged
    .map((r) => r.toUserId)
    .filter((id): id is number => id !== null);

  if (notifyUserIds.length > 0) {
    const t = await getTranslations("inventoryActions");
    const promises: Promise<unknown>[] = [];

    // Notify each holder that their copy changed (recipient: only that player sees it).
    const resolvedType = (updated?.type ?? item.type) as "clue" | "info" | "character" | "item";
    const resolvedTitle = updated?.title ?? item.title;
    for (const tid of notifyUserIds) {
      promises.push(
        dispatchMessage({
          roomId,
          actorUserId: hostId,
          nickname: "SYSTEM",
          type: "system",
          audience: "recipient",
          targetUserId: tid,
          systemKind: "inventory-receipt",
          content: t("itemUpdated", { title: resolvedTitle }),
          diceDetail: buildReceiptPayload({
            action: "updated",
            itemType: resolvedType,
            itemTitle: resolvedTitle,
          }),
        })
      );
    }

    // Host-only log so the GM sees who was notified of the edit.
    promises.push(
      dispatchMessage({
        roomId,
        actorUserId: hostId,
        nickname: "SYSTEM",
        type: "system",
        audience: "gm",
        systemKind: "inventory-dispatch",
        content: t("itemUpdatedLog", { title: updated?.title ?? item.title, count: notifyUserIds.length }),
        diceDetail: buildDispatchPayload({
          action: "update",
          itemType: (updated?.type ?? item.type) as "clue" | "info" | "character" | "item",
          itemTitle: updated?.title ?? item.title,
          count: notifyUserIds.length,
        }),
      })
    );

    await Promise.all(promises);
  }

  // Live-sync: notify all room subscribers so open inventory panels reload the edited item.
  broadcastToRoom(roomId, { type: "inventory_updated", itemId });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * distributeItemAction
 */
export async function distributeItemAction(
  roomId: number,
  itemId: number,
  toUserId: number | "all"
): Promise<Done> {
  const access = await tryRoomAccess(roomId, true);
  if (!access) return noAccess();
  const { userId: fromUserId } = access;

  // Verify that the item exists and belongs to the room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item || item.roomId !== roomId) return itemNotFound();

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
    if (!recipientMember) {
      return { success: false, error: (await getTranslations("inventoryActions"))("errorRecipientNotMember") };
    }
    
    targetUserIds = [toUserId];
  }

  if (targetUserIds.length === 0) return { success: true };

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
    await dispatchMessage({
      roomId, actorUserId: fromUserId, nickname: "SYSTEM",
      type: "system", audience: "gm",
      systemKind: "inventory-dispatch",
      content: kpSummary,
      diceDetail: buildDispatchPayload({
        action: "duplicate",
        itemType: item.type as "clue" | "info" | "character" | "item",
        itemTitle: item.title,
        recipient: toUserId === "all" ? { kind: "all" } : { kind: "user" },
      }),
    });
    return { success: true };
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
    // Soft-constraint follow-through: once a KP-only info actually reaches a
    // player, the marker no longer reflects reality — flip it to 全体可见.
    // (The distribute UI confirms with the host before getting here.)
    if (item.type === "info" && item.visibility === "kp") {
      await tx.update(inventoryItems).set({ visibility: "all" }).where(eq(inventoryItems.id, itemId));
    }
    return await tx
      .select({ id: users.id, name: users.displayName })
      .from(users)
      .where(inArray(users.id, targetUserIds));
  });

  // Prepare notification promises
  const promises: Promise<unknown>[] = [];

  // 1. Receipt to each recipient (recipient: only that player sees it, not the host —
  //    the host gets the distribution log below).
  const itemType = item.type as "clue" | "info" | "character" | "item";
  for (const tid of targetUserIds) {
    promises.push(
      dispatchMessage({
        roomId,
        actorUserId: fromUserId,
        nickname: "SYSTEM",
        type: "system",
        audience: "recipient",
        targetUserId: tid,
        systemKind: "inventory-receipt",
        content: t("receivedNew", { title: item?.title }),
        diceDetail: buildReceiptPayload({
          action: "received",
          itemType,
          itemTitle: item.title,
        }),
      })
    );
  }

  // 2. Host-only distribution log.
  const recipientName = recipients[0]?.name || t("defaultPlayer");
  const kpSummary = toUserId === "all"
    ? t("distributedAll", { title: item?.title })
    : t("distributedOne", { recipient: recipientName, title: item?.title });

  promises.push(
    dispatchMessage({
      roomId,
      actorUserId: fromUserId,
      nickname: "SYSTEM",
      type: "system",
      audience: "gm",
      systemKind: "inventory-dispatch",
      content: kpSummary,
      diceDetail: buildDispatchPayload({
        action: "distribute",
        itemType: item.type as "clue" | "info" | "character" | "item",
        itemTitle: item.title,
        recipient: toUserId === "all"
          ? { kind: "all" }
          : { kind: "user", name: recipientName },
      }),
    })
  );

  // Execute notifications in parallel
  await Promise.all(promises);

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * shareItemAction
 */
export async function shareItemAction(
  roomId: number,
  itemId: number,
  toUserId: number
): Promise<Done> {
  const t = await getTranslations("inventoryActions");
  const access = await tryRoomAccess(roomId, false, { requireWritable: true });
  if (!access) return noAccess();
  const { userId: fromUserId } = access;
  const session = await auth();
  const senderName = session?.user?.name || t("defaultPlayer");

  const result = await shareItemCore({ roomId, itemId, fromUserId, toUserId, senderName });
  if (!result.success) {
    // The core's messages are English except ALREADY_OWNED (the bot agent
    // reads them as tool output) — localize the rest for the player here.
    const key = {
      ITEM_NOT_FOUND: "errorItemNotFound",
      ROOM_MISMATCH: "errorItemNotFound",
      RECIPIENT_NOT_MEMBER: "errorRecipientNotMember",
      NOT_OWNED: "errorNotOwned",
    }[result.code as string];
    return { success: false, error: key ? t(key) : result.error };
  }

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
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
        sender: true,
        recipient: true
    },
    orderBy: [desc(inventoryDistributions.createdAt)]
  });

  // toUsername (the player themselves) feeds the 持有 fallback in DetailModal —
  // players get no distribution history, so this is their only holder source.
  return raw.map((d) => ({
    ...d,
    toUsername: d.recipient?.displayName || d.recipient?.username,
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
export async function markInventoryViewedAction(roomId: number): Promise<Done> {
  const access = await tryRoomAccess(roomId, false);
  if (!access) return noAccess();
  const { userId } = access;

  // Opening the panel acknowledges both freshly-received ("new") and edited
  // ("updated") copies, so clear both flags in one pass.
  await db.update(inventoryDistributions)
    .set({ viewed: true, updated: false })
    .where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, userId),
        sql`${inventoryDistributions.viewed} = ${false}`
      )
    );

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/**
 * Get unread inventory count for badge display.
 */
export async function getUnreadInventoryCountAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  return countUnreadInventory(roomId, userId);
}

/**
 * Delete an inventory item (Host only).
 * Cascades to delete all distribution records.
 */
export async function deleteInventoryItemAction(roomId: number, itemId: number): Promise<Done> {
  if (!(await tryRoomAccess(roomId, true))) return noAccess();

  // Verify item belongs to room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item || item.roomId !== roomId) return itemNotFound();

  await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));

  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}
