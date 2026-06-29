export const runtime = "nodejs";

import { NextRequest } from "next/server";
import fs from "fs/promises";
import { auth } from "@/auth";
import { resolveStickerPath, mimeForSticker } from "@/lib/stickers";

/**
 * GET /api/stickers/[pack]/[file]
 * Streams a sticker image. Stickers are a global, curated resource, so any
 * authenticated user may fetch them (not room-scoped). Returns 404 when the
 * file is missing so the UI can fall back to a placeholder.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pack: string; file: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { pack, file } = await params;
  const filePath = resolveStickerPath(decodeURIComponent(pack), decodeURIComponent(file));
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType = mimeForSticker(file) || "application/octet-stream";

  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      // Sticker filenames are stable but their content can be swapped by an
      // admin, so cache modestly (not `immutable`) to pick up replacements.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
