import { db } from "@/db";
import { inventoryItems, inventoryDistributions, roomMembers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { dispatchMessage } from "@/lib/messaging/router";
import { buildDispatchPayload, buildReceiptPayload } from "@/lib/messaging/dispatch-payload";

export type ShareItemErrorCode =
  | "ITEM_NOT_FOUND"
  | "ROOM_MISMATCH"
  | "RECIPIENT_NOT_MEMBER"
  | "NOT_OWNED"
  | "ALREADY_OWNED";

export type ShareItemResult =
  | { success: true; itemTitle: string; recipientName: string }
  | { success: false; code: ShareItemErrorCode; error: string };

/**
 * Core of "a member hands an item they hold to another member" — shared by the
 * human path (`shareItemAction`, session-authenticated) and the bot agent's
 * `give_item` tool (no session; `fromUserId` is the bot). Validation, the
 * `inventory_distributions` insert, and both notifications live here so the
 * two paths cannot drift. Caller identity/authorization stays with the caller:
 * the action derives `fromUserId` from the session, the agent passes the bot id.
 */
export async function shareItemCore(params: {
  roomId: number;
  itemId: number;
  fromUserId: number;
  toUserId: number;
  senderName: string;
}): Promise<ShareItemResult> {
  const { roomId, itemId, fromUserId, toUserId, senderName } = params;
  const t = await getTranslations("inventoryActions");

  // Verify that the item exists and belongs to the room
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  if (!item) return { success: false, code: "ITEM_NOT_FOUND", error: "Item not found" };
  if (item.roomId !== roomId) return { success: false, code: "ROOM_MISMATCH", error: "Item room mismatch" };

  // Verify recipient is a member of the room
  const [recipientMember] = await db.select().from(roomMembers).where(
    and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, toUserId))
  );
  if (!recipientMember) {
    return { success: false, code: "RECIPIENT_NOT_MEMBER", error: "Recipient is not a member of this room" };
  }

  const [own] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.roomId, roomId),
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, fromUserId)
    )
  );
  if (!own) {
    return { success: false, code: "NOT_OWNED", error: "You don't have this item in this room" };
  }

  // Check if recipient already has it
  const [hasAlready] = await db.select().from(inventoryDistributions).where(
    and(
      eq(inventoryDistributions.roomId, roomId),
      eq(inventoryDistributions.itemId, itemId),
      eq(inventoryDistributions.toUserId, toUserId)
    )
  );
  if (hasAlready) {
    return { success: false, code: "ALREADY_OWNED", error: t("alreadyOwned") };
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
  const itemType = item.type as "clue" | "info" | "character" | "item";

  // 1. Notify the recipient only (the sharer initiated it and doesn't need the notice).
  await dispatchMessage({
    roomId,
    actorUserId: fromUserId,
    nickname: "SYSTEM",
    type: "system",
    audience: "recipient",
    targetUserId: toUserId,
    systemKind: "inventory-receipt",
    content: t("sharedReceived", { sender: senderName, title: item.title }),
    diceDetail: buildReceiptPayload({
      action: "shared-received",
      itemType,
      itemTitle: item.title,
      sender: senderName,
    }),
  });

  // 2. Notify the sharer & host (GM sees what players share).
  await dispatchMessage({
    roomId,
    actorUserId: fromUserId,
    nickname: "SYSTEM",
    type: "system",
    audience: "gm",
    systemKind: "inventory-dispatch",
    content: t("sharedSent", { title: item.title, recipient: recipientName }),
    diceDetail: buildDispatchPayload({
      action: "share",
      itemType,
      itemTitle: item.title,
      recipient: { kind: "user", name: recipientName },
    }),
  });

  return { success: true, itemTitle: item.title, recipientName };
}
