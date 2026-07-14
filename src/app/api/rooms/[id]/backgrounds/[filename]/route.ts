export const runtime = "nodejs";

import { NextRequest } from "next/server";
import fs from "fs/promises";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { resolveRoomBackgroundPath } from "@/lib/backgrounds";

/**
 * GET /api/rooms/[id]/backgrounds/[filename]
 * Streams a room background to room members. Stored files are always WebP.
 * Missing file → 404; the client treats that as "background off".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  const roomId = parseInt(id);
  if (isNaN(roomId)) {
    return new Response("Invalid room ID", { status: 400 });
  }

  // Only room members may view a room's backgrounds.
  try {
    await checkRoomAccess(roomId, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    return new Response(msg, { status: msg.includes("authenticated") ? 401 : 403 });
  }

  // One flat directory for all rooms — bind the request to its own room so
  // membership in *some* room can't fetch another room's background.
  if (!filename.startsWith(`${roomId}-`)) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = resolveRoomBackgroundPath(filename);
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/webp",
      // Filenames are unique per upload, so the bytes never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
