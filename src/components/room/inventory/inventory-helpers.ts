import { Search, File, User, Box, type LucideIcon } from "lucide-react";

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

// value → i18n key (under the `inventory` namespace) for each metadata enum.
export const sourceKey: Record<string, string> = { kp: "sourceKp", player: "sourcePlayer", system: "sourceSystem" };
export const visibilityKey: Record<string, string> = { all: "visibilityAll", kp: "visibilityKp" };
export const relationKey: Record<string, string> = { ally: "relationAlly", neutral: "relationNeutral", hostile: "relationHostile", unknown: "relationUnknown" };
export const categoryKey: Record<string, string> = { weapon: "catWeapon", tool: "catTool", consumable: "catConsumable", other: "catOther" };
// relation → badge colour classes for the detail view.
export const relationBadgeClass: Record<string, string> = {
  ally: "bg-success/20 text-success border-success/40",
  neutral: "bg-accent/20 text-accent border-accent/40",
  hostile: "bg-danger/20 text-danger border-danger/40",
  unknown: "bg-text-dim/20 text-text-muted border-text-dim/40",
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

export const typeEmoji = (tStr: string) => ({ clue: "🃏", info: "📄", character: "👤", item: "🎒" }[tStr] || "📦");

// Category → lucide icon + semantic color (rainglass design): clue=cyan,
// info=violet, character=magenta, item=green.
export const typeIcon: Record<InventoryItemType, LucideIcon> = {
  clue: Search,
  info: File,
  character: User,
  item: Box,
};
export const typeColorClass: Record<InventoryItemType, string> = {
  clue: "text-primary",
  info: "text-ai",
  character: "text-accent",
  item: "text-success",
};
// Active type-tab tint (border + bg) — matches each type's semantic accent so the
// selected card type lights up in its own colour (clue=vermilion, info=indigo,
// character=gold, item=green). Static strings so Tailwind keeps them at build time.
export const typeActiveClass: Record<InventoryItemType, string> = {
  clue: "border-primary/60 bg-primary/10",
  info: "border-ai/60 bg-ai/10",
  character: "border-accent/60 bg-accent/10",
  item: "border-success/60 bg-success/10",
};

// Unread = freshly received OR edited-since-viewed. `updated` distinguishes the two
// so the backpack can flag a host edit differently from a brand-new hand-off.
export const isUnread = (d: { viewed?: boolean | number | null }) => d.viewed === false || d.viewed === 0;
export const isUpdated = (d: { updated?: boolean | number | null }) => d.updated === true || d.updated === 1;
export const isNew = (d: { viewed?: boolean | number | null; updated?: boolean | number | null }) => isUnread(d) && !isUpdated(d);
