export interface InventoryItem {
  id: number;
  type: "clue" | "info" | "character" | "item";
  title: string;
  contentJson: string;
  imageUrl: string | null;
  // Type-specific metadata (nullable per type) — see schema.ts inventory_items.
  source?: string | null;
  visibility?: string | null;
  relation?: string | null;
  category?: string | null;
  quantity?: number | null;
  createdAt: string;
}

/** Type-specific metadata edited in the create/edit modal and persisted to inventory_items. */
export interface ItemMeta {
  source: "kp" | "player" | "system";
  visibility: "all" | "kp";
  relation: "ally" | "neutral" | "hostile" | "unknown";
  category: "weapon" | "tool" | "consumable" | "other";
  quantity: number;
}

export const DEFAULT_ITEM_META: ItemMeta = {
  source: "kp", visibility: "all", relation: "ally", category: "tool", quantity: 1,
};

export interface Distribution {
  id: number;
  itemId: number;
  fromUserId: number;
  toUserId: number;
  createdAt: string;
  action: string;
  viewed?: number | boolean | null;
  updated?: number | boolean | null;
  item?: InventoryItem;
  toUsername?: string;
  fromUsername?: string;
}

export interface InventoryPlayer {
  id: number;
  username: string;
  nickname: string;
  isOnline?: boolean;
  avatarColor?: string | null;
  isBot?: boolean;
}

export type InventoryItemType = "clue" | "info" | "character" | "item";

export interface ContentFields {
  text: string;
  basicInfo: string;
  detail: string;
  appearance: string;
  extra: string;
}

export function formatContent(item: InventoryItem): string {
  try {
    const c = JSON.parse(item.contentJson);
    if (item.type === "clue" || item.type === "info") return c.text || "";
    if (item.type === "character") return `${c.basicInfo || ""}\n${c.detail || ""}`;
    return `${c.appearance || ""}\n${c.extra || ""}`;
  } catch { return item.contentJson; }
}

/** The backpack's category rail selection, i.e. a type or the "all" bucket. */
export type BackpackFilter = "all" | InventoryItemType;
