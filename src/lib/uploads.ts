import path from "path";
import fs from "fs/promises";

/**
 * Chat image uploads.
 *
 * Images are written to a server-side cache folder (NOT committed to git, NOT
 * stored in the DB). Only a relative path URL is persisted on the message row,
 * which is served back through `GET /api/rooms/[id]/images/[filename]`.
 *
 * If a cached file is later deleted, the serving route returns 404 and the chat
 * UI falls back to a placeholder instead of a broken image.
 */

/** Hard cap on a single uploaded image: 1 MB. */
export const CHAT_IMAGE_MAX_BYTES = 1024 * 1024;

/** Allowed image MIME types → canonical file extension. */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export function isAllowedImageMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXT, mime);
}

export function extForMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

/**
 * Absolute path to the chat-image cache directory.
 * Overridable via CHAT_IMAGE_DIR; defaults to `<cwd>/cache/chat-images`.
 */
export function getChatImageDir(): string {
  const configured = process.env.CHAT_IMAGE_DIR;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), "cache", "chat-images");
}

/** Ensure the cache directory exists; safe to call repeatedly. */
export async function ensureChatImageDir(): Promise<string> {
  const dir = getChatImageDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Validate that a filename is a plain, single-segment name (defends the serving
 * route against path traversal). Returns the resolved absolute path on success,
 * or null if the name is unsafe.
 */
export function resolveChatImagePath(filename: string): string | null {
  // Must be a single safe segment: letters, digits, dot, dash, underscore.
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return null;
  if (filename.includes("..")) return null;

  const dir = getChatImageDir();
  const full = path.join(dir, filename);

  // Final guard: the resolved path must stay inside the cache directory.
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

  return full;
}
