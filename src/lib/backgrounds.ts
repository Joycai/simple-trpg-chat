import path from "path";
import fs from "fs/promises";

/**
 * Room background images (docs/design/room-background.md).
 *
 * Unlike chat images (`uploads.ts`), backgrounds are NOT a disposable cache:
 * hosts pre-upload them as prep material and reuse them across sessions. They
 * live in their own directory, are excluded from routine chat-image cleanup,
 * and are only deleted when the host removes them, the room is deleted, or an
 * admin explicitly opts in (`includeBackgrounds`).
 *
 * Every stored file is a sharp-re-encoded WebP — original bytes (EXIF,
 * malformed chunks, any embedded payload) never reach the disk.
 */

/** Hard cap on an uploaded original: 5 MB (re-encoded to a much smaller WebP). */
export const BACKGROUND_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Max backgrounds per room. */
export const ROOM_BACKGROUND_MAX_COUNT = 12;

/** Longest edge after resize. */
export const BACKGROUND_MAX_DIMENSION = 2560;

/** WebP encode quality. */
export const BACKGROUND_WEBP_QUALITY = 80;

/**
 * Accepted input MIME types. GIF is intentionally rejected (no animated
 * backgrounds — a first frame masquerading as a still is more confusing
 * than a clean 415).
 */
const ALLOWED_INPUT_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedBackgroundMime(mime: string): boolean {
  return ALLOWED_INPUT_MIMES.has(mime);
}

/**
 * Absolute path to the room-background directory.
 * Overridable via ROOM_BACKGROUND_DIR; defaults to `<cwd>/cache/room-backgrounds`.
 * Kept separate from CHAT_IMAGE_DIR on purpose — see module doc.
 */
export function getRoomBackgroundDir(): string {
  const configured = process.env.ROOM_BACKGROUND_DIR;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), "cache", "room-backgrounds");
}

/** Ensure the background directory exists; safe to call repeatedly. */
export async function ensureRoomBackgroundDir(): Promise<string> {
  const dir = getRoomBackgroundDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Validate that a filename is a plain, single-segment name (defends the
 * serving route against path traversal). Returns the resolved absolute path
 * on success, or null if the name is unsafe. Mirrors `resolveChatImagePath`.
 */
export function resolveRoomBackgroundPath(filename: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return null;
  if (filename.includes("..")) return null;

  const dir = getRoomBackgroundDir();
  const full = path.join(dir, filename);

  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

  return full;
}

/** Public URL for a stored background file. */
export function roomBackgroundUrl(roomId: number, filename: string): string {
  return `/api/rooms/${roomId}/backgrounds/${filename}`;
}

/**
 * Re-encode an uploaded image as a bounded WebP.
 *
 * - `.rotate()` applies the EXIF orientation before metadata is dropped, so
 *   phone photos come out upright.
 * - `fit: "inside"` + `withoutEnlargement` bounds the longest edge at
 *   BACKGROUND_MAX_DIMENSION without upscaling small images.
 * - Throws if sharp cannot decode the buffer (non-image bytes behind an
 *   image MIME) — callers translate that into a 415.
 *
 * sharp is imported lazily so that merely importing this module (e.g. from
 * the serving route or tests) never loads the native binary.
 */
export async function compressBackgroundToWebp(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  return sharp(input)
    .rotate()
    .resize({
      width: BACKGROUND_MAX_DIMENSION,
      height: BACKGROUND_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: BACKGROUND_WEBP_QUALITY })
    .toBuffer();
}
