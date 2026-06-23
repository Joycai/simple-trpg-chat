import { Search, File, User, Box, type LucideIcon } from "lucide-react";

export interface InventoryItem {
  id: number;
  type: "clue" | "info" | "character" | "item";
  title: string;
  contentJson: string;
  imageUrl: string | null;
  createdAt: string;
}

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

// Unread = freshly received OR edited-since-viewed. `updated` distinguishes the two
// so the backpack can flag a host edit differently from a brand-new hand-off.
export const isUnread = (d: { viewed?: boolean | number | null }) => d.viewed === false || d.viewed === 0;
export const isUpdated = (d: { updated?: boolean | number | null }) => d.updated === true || d.updated === 1;
export const isNew = (d: { viewed?: boolean | number | null; updated?: boolean | number | null }) => isUnread(d) && !isUpdated(d);
