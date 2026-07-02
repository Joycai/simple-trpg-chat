import fs from "fs/promises";
import path from "path";
import { getChatImageDir } from "@/lib/uploads";

/**
 * Chat-image cache accounting & cleanup.
 *
 * Uploaded chat images live as loose files in the cache directory (see
 * `src/lib/uploads.ts`). Each filename is minted as:
 *
 *     `${roomId}-${Date.now()}-${randomHex}.${ext}`
 *
 * so the room id and the upload timestamp can be recovered from the name alone
 * — no DB round-trip is needed to attribute a file to a room or age it out.
 *
 * Cleanup only ever deletes files inside the cache dir. Message rows that point
 * at a removed file are left untouched: the serving route 404s and the chat UI
 * already falls back to a placeholder (documented in `uploads.ts`).
 */

/** Default cache quota shown as the denominator in the admin UI (5 GB). */
const DEFAULT_QUOTA_BYTES = 5 * 1024 ** 3;

/** Cutoff windows offered for time-based cleanup. */
export type CleanupRange = "7d" | "30d" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Total cache quota in bytes, overridable via `CHAT_IMAGE_QUOTA_BYTES`. */
export function getImageCacheQuotaBytes(): number {
  const raw = process.env.CHAT_IMAGE_QUOTA_BYTES;
  if (raw && raw.trim()) {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_QUOTA_BYTES;
}

/** Filename shape produced by the uploader: `${roomId}-${ms}-${hex}.${ext}`. */
const FILE_RE = /^(\d+)-(\d+)-[A-Za-z0-9]+\.(jpg|jpeg|png|gif|webp)$/;

interface CachedFile {
  name: string;
  roomId: number;
  uploadedMs: number;
  bytes: number;
}

/** Per-room rollup of cache usage. */
export interface RoomImageUsage {
  roomId: number;
  count: number;
  bytes: number;
  /** Timestamp (ms) of the oldest image in the room, or null when empty. */
  earliestMs: number | null;
  /** Bytes attributable to images older than 7 / 30 days. */
  bytes7d: number;
  bytes30d: number;
}

export interface ImageCacheStats {
  totalBytes: number;
  totalCount: number;
  roomCount: number;
  quotaBytes: number;
  /** Bytes uploaded since the start of the current local day. */
  bytesToday: number;
  /** Bytes older than 7 / 30 days across all rooms (batch-cleanup estimates). */
  bytes7d: number;
  bytes30d: number;
  /** Per-room usage, sorted by bytes descending. */
  rooms: RoomImageUsage[];
}

/** Read + parse every cache file. Missing dir → empty list. */
async function readCacheFiles(): Promise<CachedFile[]> {
  const dir = getChatImageDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const files: CachedFile[] = [];
  for (const name of names) {
    const m = FILE_RE.exec(name);
    if (!m) continue; // skip anything the uploader didn't mint
    let stat: import("fs").Stats;
    try {
      stat = await fs.stat(path.join(dir, name));
    } catch {
      continue; // vanished between readdir and stat — ignore
    }
    if (!stat.isFile()) continue;
    files.push({
      name,
      roomId: Number(m[1]),
      uploadedMs: Number(m[2]),
      bytes: stat.size,
    });
  }
  return files;
}

function startOfTodayMs(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Scan the cache and produce totals plus a per-room breakdown. */
export async function getImageCacheStats(): Promise<ImageCacheStats> {
  const files = await readCacheFiles();
  const now = Date.now();
  const cut7 = now - 7 * DAY_MS;
  const cut30 = now - 30 * DAY_MS;
  const todayStart = startOfTodayMs(now);

  const byRoom = new Map<number, RoomImageUsage>();
  let totalBytes = 0;
  let bytesToday = 0;
  let bytes7d = 0;
  let bytes30d = 0;

  for (const f of files) {
    totalBytes += f.bytes;
    if (f.uploadedMs >= todayStart) bytesToday += f.bytes;
    if (f.uploadedMs < cut7) bytes7d += f.bytes;
    if (f.uploadedMs < cut30) bytes30d += f.bytes;

    let room = byRoom.get(f.roomId);
    if (!room) {
      room = { roomId: f.roomId, count: 0, bytes: 0, earliestMs: null, bytes7d: 0, bytes30d: 0 };
      byRoom.set(f.roomId, room);
    }
    room.count += 1;
    room.bytes += f.bytes;
    room.earliestMs = room.earliestMs === null ? f.uploadedMs : Math.min(room.earliestMs, f.uploadedMs);
    if (f.uploadedMs < cut7) room.bytes7d += f.bytes;
    if (f.uploadedMs < cut30) room.bytes30d += f.bytes;
  }

  const rooms = [...byRoom.values()].sort((a, b) => b.bytes - a.bytes);

  return {
    totalBytes,
    totalCount: files.length,
    roomCount: rooms.length,
    quotaBytes: getImageCacheQuotaBytes(),
    bytesToday,
    bytes7d,
    bytes30d,
    rooms,
  };
}

/**
 * Delete cache files, optionally scoped to a single room and/or an age cutoff.
 *
 * @param scope   `"all"` for every room, or a numeric room id.
 * @param range   `"7d"` / `"30d"` delete files older than that window; `"all"`
 *                deletes regardless of age.
 * @returns bytes freed and file count removed.
 */
export async function cleanupImageCache(
  scope: "all" | number,
  range: CleanupRange
): Promise<{ freedBytes: number; deletedCount: number }> {
  const files = await readCacheFiles();
  const now = Date.now();
  const cutoff = range === "7d" ? now - 7 * DAY_MS : range === "30d" ? now - 30 * DAY_MS : Infinity;
  const dir = getChatImageDir();

  let freedBytes = 0;
  let deletedCount = 0;

  for (const f of files) {
    if (scope !== "all" && f.roomId !== scope) continue;
    if (f.uploadedMs >= cutoff) continue; // too new for this window
    try {
      await fs.unlink(path.join(dir, f.name));
      freedBytes += f.bytes;
      deletedCount += 1;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }

  return { freedBytes, deletedCount };
}
