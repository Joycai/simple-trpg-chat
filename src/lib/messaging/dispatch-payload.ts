/**
 * Structured payload carried in `messages.diceDetail` when `systemKind` is
 * `inventory-dispatch`. Lets the chat UI render the dispatch pill (icon +
 * sentence + type-colored item chip) without parsing message text.
 *
 * Five actions cover the host-side dispatch log:
 *   - distribute  → host handed an item/info/character to one or all members
 *   - push        → host pushed a clue to all players or a list of targets
 *   - share       → a player shared an item they own with another player
 *   - update      → host edited a previously-distributed item; N holders notified
 *   - duplicate   → host tried to redistribute an already-owned item (warning)
 *
 * The plain-text `content` is still set on each message for fallback rendering
 * (themes without dispatch-pill styling and accessibility/search).
 */

import type { InventoryItemType } from "@/db/schema";

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
