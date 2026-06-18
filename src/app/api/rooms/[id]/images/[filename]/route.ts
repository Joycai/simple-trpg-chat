export const runtime = "nodejs";

import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { resolveChatImagePath } from "@/lib/uploads";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * GET /api/rooms/[id]/images/[filename]
 * Streams a cached chat image to room members. Returns 404 when the file is
 * missing (e.g. it was removed from the cache) so the UI can fall back to a
 * placeholder instead of showing a broken image.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  const roomId = parseInt(id);
  if (isNaN(roomId)) {
    return new Response("Invalid room ID", { status: 400 });
  }

  // Only room members may view a room's images.
  try {
    await checkRoomAccess(roomId, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return new Response(msg, { status: msg.includes("authenticated") ? 401 : 403 });
  }

  const filePath = resolveChatImagePath(filename);
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    // Missing / deleted file — graceful 404, the UI renders a placeholder.
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(filename).slice(1).toLowerCase();
  const contentType = EXT_TO_MIME[ext] || "application/octet-stream";

  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      // Filenames are unique per upload, so the bytes never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
