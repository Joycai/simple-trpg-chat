"use server";

import { inArray } from "drizzle-orm";
import { requireAdmin } from "@/app/admin/actions";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { broadcastToRoom } from "@/lib/events";
import {
  getImageCacheStats,
  cleanupImageCache,
  getRoomBackgroundStats,
  cleanupRoomBackgrounds,
  type CleanupRange,
  type RoomImageUsage,
  type RoomBackgroundUsage,
} from "@/lib/image-cache";

/** Per-room usage row enriched with the room's display name. */
export interface RoomImageUsageView extends RoomImageUsage {
  /** Room name, or null when the room no longer exists (orphaned files). */
  name: string | null;
}

/** Background usage row enriched with the room's display name. */
export interface RoomBackgroundUsageView extends RoomBackgroundUsage {
  name: string | null;
}

/** Background usage summary — kept separate from the chat-image numbers. */
export interface BackgroundStatsView {
  totalBytes: number;
  totalCount: number;
  roomCount: number;
  rooms: RoomBackgroundUsageView[];
}

export interface ImageCacheStatsView {
  totalBytes: number;
  totalCount: number;
  roomCount: number;
  quotaBytes: number;
  bytesToday: number;
  bytes7d: number;
  bytes30d: number;
  rooms: RoomImageUsageView[];
  /** Room-background usage (docs/design/room-background.md). */
  backgrounds: BackgroundStatsView;
}

/** Attach room names to the raw per-room usage rows. */
async function withRoomNames<T extends { roomId: number }>(
  usage: T[]
): Promise<(T & { name: string | null })[]> {
  const ids = usage.map((r) => r.roomId);
  const nameById = new Map<number, string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .where(inArray(rooms.id, ids));
    for (const r of rows) nameById.set(r.id, r.name);
  }
  return usage.map((r) => ({ ...r, name: nameById.get(r.roomId) ?? null }));
}

async function buildStatsView(): Promise<ImageCacheStatsView> {
  const [stats, bgStats] = await Promise.all([getImageCacheStats(), getRoomBackgroundStats()]);
  const [roomsView, bgRoomsView] = await Promise.all([
    withRoomNames(stats.rooms),
    withRoomNames(bgStats.rooms),
  ]);
  return {
    ...stats,
    rooms: roomsView,
    backgrounds: { ...bgStats, rooms: bgRoomsView },
  };
}

/** Full image-cache breakdown for the admin dashboard + management tab. */
export async function getImageCacheStatsAction(): Promise<ImageCacheStatsView> {
  await requireAdmin();
  return buildStatsView();
}

/**
 * Delete cached images and return the refreshed stats.
 *
 * @param scope  `"all"` for every room, or a numeric room id.
 * @param range  `"7d"` / `"30d"` / `"all"` (chat images only).
 * @param includeBackgrounds  Explicit opt-in: ALSO delete the scope's room
 *        backgrounds (all of them — no time window; they're prep material,
 *        not an aging cache). Default false: backgrounds are never touched.
 */
export async function cleanupImageCacheAction(
  scope: "all" | number,
  range: CleanupRange,
  includeBackgrounds = false
): Promise<{ freedBytes: number; deletedCount: number; stats: ImageCacheStatsView }> {
  await requireAdmin();

  if (scope !== "all" && (!Number.isInteger(scope) || scope <= 0)) {
    throw new Error("Invalid room scope");
  }
  if (range !== "7d" && range !== "30d" && range !== "all") {
    throw new Error("Invalid cleanup range");
  }

  let { freedBytes, deletedCount } = await cleanupImageCache(scope, range);

  if (includeBackgrounds === true) {
    const bg = await cleanupRoomBackgrounds(scope);
    freedBytes += bg.freedBytes;
    deletedCount += bg.deletedCount;
    // Rooms that were actively showing a deleted background: tell their
    // members to drop the image now rather than on next navigation.
    for (const roomId of bg.affectedActiveRoomIds) {
      broadcastToRoom(roomId, { type: "room_settings_updated" });
    }
  }

  return { freedBytes, deletedCount, stats: await buildStatsView() };
}
