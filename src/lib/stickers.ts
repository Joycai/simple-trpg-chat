import path from "path";
import fs from "fs";

/**
 * Sticker packs — filesystem-convention emoji.
 *
 * Stickers are curated, admin-managed assets dropped onto disk (NOT uploaded by
 * players, NOT stored in the DB). The convention is one sub-folder per pack:
 *
 *   <STICKER_DIR>/<pack>/<file>.{png,gif,webp,jpg,svg}
 *
 * The sub-folder name is the pack id *and* its display label; each image file
 * is a sticker. The tree is scanned once per process and cached (rescan only on
 * restart). A chat message references a sticker by the path URL served back
 * through `GET /api/stickers/[pack]/[file]`; only that path is persisted on the
 * message row.
 *
 * SVG is allowed here (unlike chat-image uploads) because these are trusted
 * local files, and the UI renders them via <img> where embedded scripts never
 * execute.
 */

/** Allowed sticker file extensions → canonical MIME type. */
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

/**
 * Safe single path segment: ASCII word chars, dot, dash, plus CJK so packs can
 * have Chinese names (e.g. "黄豆"). Used for both pack and file names.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._\-一-鿿]+$/;

export interface Sticker {
  /** File name including extension, e.g. "smile.svg". */
  id: string;
  /** Server path URL for <img src>, e.g. "/api/stickers/%E9%BB%84%E8%B1%86/smile.svg". */
  url: string;
}

export interface StickerPack {
  /** Folder name = pack id. */
  pack: string;
  /** Display label (same as folder name for now). */
  label: string;
  stickers: Sticker[];
}

declare global {
  var __stickerManifest: StickerPack[] | undefined;
}

/**
 * Absolute path to the sticker root directory.
 * Overridable via STICKER_DIR; defaults to `<cwd>/data/stickers`.
 */
export function getStickerDir(): string {
  const configured = process.env.STICKER_DIR;
  if (configured && configured.trim()) {
    return path.resolve(configured.trim());
  }
  return path.join(process.cwd(), "data", "stickers");
}

function extOf(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

export function mimeForSticker(file: string): string | null {
  return EXT_TO_MIME[extOf(file)] ?? null;
}

/** Build a URL with each segment percent-encoded (handles CJK pack names). */
function stickerUrl(pack: string, file: string): string {
  return `/api/stickers/${encodeURIComponent(pack)}/${encodeURIComponent(file)}`;
}

/**
 * Walk the sticker tree and build the manifest. Skips dot-files, non-image
 * files, and empty packs. Synchronous (runs once, cached) and resilient: a
 * missing root just yields an empty list.
 */
function buildManifest(): StickerPack[] {
  const root = getStickerDir();
  let packDirs: fs.Dirent[];
  try {
    packDirs = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const packs: StickerPack[] = [];
  for (const dirent of packDirs) {
    if (!dirent.isDirectory()) continue;
    const pack = dirent.name;
    if (pack.startsWith(".") || !SAFE_SEGMENT.test(pack)) continue;

    let files: string[];
    try {
      files = fs.readdirSync(path.join(root, pack));
    } catch {
      continue;
    }

    const stickers: Sticker[] = files
      .filter((f) => !f.startsWith(".") && SAFE_SEGMENT.test(f) && !!EXT_TO_MIME[extOf(f)])
      .sort((a, b) => a.localeCompare(b))
      .map((f) => ({ id: f, url: stickerUrl(pack, f) }));

    if (stickers.length > 0) {
      packs.push({ pack, label: pack, stickers });
    }
  }
  packs.sort((a, b) => a.label.localeCompare(b.label));
  return packs;
}

/** Cached manifest; scanned once per process. Admins can force a re-scan via
 *  `invalidateStickerManifest()` (exposed through the admin sticker action)
 *  when they drop new files into the sticker directory without restarting. */
export function getStickerManifest(): StickerPack[] {
  if (!globalThis.__stickerManifest) {
    globalThis.__stickerManifest = buildManifest();
  }
  return globalThis.__stickerManifest;
}

/**
 * Drop the cached manifest so the next `getStickerManifest()` call rescans
 * disk. Called from the admin sticker-refresh action so a host doesn't need
 * to restart the server after adding or replacing pack files.
 */
export function invalidateStickerManifest(): void {
  globalThis.__stickerManifest = undefined;
}

/**
 * Resolve a (pack, file) pair to an absolute path inside the sticker root,
 * defending the serving route against path traversal. Returns null when the
 * names are unsafe or escape the root.
 */
export function resolveStickerPath(pack: string, file: string): string | null {
  if (!SAFE_SEGMENT.test(pack) || !SAFE_SEGMENT.test(file)) return null;
  if (pack.includes("..") || file.includes("..")) return null;
  if (!EXT_TO_MIME[extOf(file)]) return null;

  const root = getStickerDir();
  const full = path.join(root, pack, file);
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/**
 * Validate that a message's sticker reference points at a sticker present in the
 * current manifest. Format: `/api/stickers/<pack>/<file>` (segments encoded).
 */
export function isValidStickerRef(content: string): boolean {
  const m = /^\/api\/stickers\/([^/]+)\/([^/]+)$/.exec(content);
  if (!m) return false;
  let pack: string, file: string;
  try {
    pack = decodeURIComponent(m[1]);
    file = decodeURIComponent(m[2]);
  } catch {
    return false;
  }
  return getStickerManifest().some(
    (p) => p.pack === pack && p.stickers.some((s) => s.id === file)
  );
}
