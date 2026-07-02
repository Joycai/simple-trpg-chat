"use server";

import { inArray } from "drizzle-orm";
import { requireAdmin } from "@/app/admin/actions";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import {
  getImageCacheStats,
  cleanupImageCache,
  type CleanupRange,
  type RoomImageUsage,
} from "@/lib/image-cache";

/** Per-room usage row enriched with the room's display name. */
export interface RoomImageUsageView extends RoomImageUsage {
  /** Room name, or null when the room no longer exists (orphaned files). */
  name: string | null;
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
}

/** Attach room names to the raw per-room usage rows. */
async function withRoomNames(usage: RoomImageUsage[]): Promise<RoomImageUsageView[]> {
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

/** Full image-cache breakdown for the admin dashboard + management tab. */
export async function getImageCacheStatsAction(): Promise<ImageCacheStatsView> {
  await requireAdmin();
  const stats = await getImageCacheStats();
  return { ...stats, rooms: await withRoomNames(stats.rooms) };
}

/**
 * Delete cached images and return the refreshed stats.
 *
 * @param scope  `"all"` for every room, or a numeric room id.
 * @param range  `"7d"` / `"30d"` / `"all"`.
 */
export async function cleanupImageCacheAction(
  scope: "all" | number,
  range: CleanupRange
): Promise<{ freedBytes: number; deletedCount: number; stats: ImageCacheStatsView }> {
  await requireAdmin();

  if (scope !== "all" && (!Number.isInteger(scope) || scope <= 0)) {
    throw new Error("Invalid room scope");
  }
  if (range !== "7d" && range !== "30d" && range !== "all") {
    throw new Error("Invalid cleanup range");
  }

  const { freedBytes, deletedCount } = await cleanupImageCache(scope, range);
  const stats = await getImageCacheStats();
  return { freedBytes, deletedCount, stats: { ...stats, rooms: await withRoomNames(stats.rooms) } };
}
