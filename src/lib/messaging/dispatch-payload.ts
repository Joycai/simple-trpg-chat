/**
 * Structured payloads carried in `messages.diceDetail` when `systemKind` is
 * `inventory-dispatch` (host-side log) or `inventory-receipt` (player-side
 * notification). Both shapes let the chat UI render an icon + sentence +
 * type-colored chip without parsing message text — see DispatchPill and
 * ReceiptPill in ChatMessage.
 *
 * The plain-text `content` is still set on each message for fallback rendering
 * (themes without pill styling and accessibility/search).
 */

import type { InventoryItemType } from "@/db/schema";

// ----- inventory-dispatch (host-side log) -----
// distribute  → host handed an item/info/character to one or all members
// push        → host pushed a clue to one or more players
// share       → a player shared an item they own with another player
// update      → host edited a previously-distributed item; N holders notified
// duplicate   → host tried to redistribute an already-owned item (warning)

export type DispatchAction = "distribute" | "push" | "share" | "update" | "duplicate";

/** `all` collapses both "all members" (distribute) and "all players" (push) — disambiguated by `action`. */
export type DispatchRecipientKind = "all" | "user";

export interface DispatchPayload {
  inventoryDispatch: {
    action: DispatchAction;
    item: { type: InventoryItemType; title: string };
    recipient?: { kind: DispatchRecipientKind; name?: string } | null;
    /** Holders notified count, populated for `update` only. */
    count?: number | null;
  };
}

export function buildDispatchPayload(args: {
  action: DispatchAction;
  itemType: InventoryItemType;
  itemTitle: string;
  recipient?: { kind: DispatchRecipientKind; name?: string } | null;
  count?: number | null;
}): string {
  const payload: DispatchPayload = {
    inventoryDispatch: {
      action: args.action,
      item: { type: args.itemType, title: args.itemTitle },
      recipient: args.recipient ?? null,
      count: args.count ?? null,
    },
  };
  return JSON.stringify(payload);
}

// ----- inventory-receipt (player-side notification) -----
// received        → recipient got a new item / info / character / clue
// updated         → host edited an item this recipient already had
// shared-received → another player shared an item with this recipient

export type ReceiptAction = "received" | "updated" | "shared-received";

export interface ReceiptPayload {
  inventoryReceipt: {
    action: ReceiptAction;
    item: { type: InventoryItemType; title: string };
    /** Present for `shared-received` (the sharing player's display name). */
    sender?: string | null;
  };
}

export function buildReceiptPayload(args: {
  action: ReceiptAction;
  itemType: InventoryItemType;
  itemTitle: string;
  sender?: string | null;
}): string {
  const payload: ReceiptPayload = {
    inventoryReceipt: {
      action: args.action,
      item: { type: args.itemType, title: args.itemTitle },
      sender: args.sender ?? null,
    },
  };
  return JSON.stringify(payload);
}
