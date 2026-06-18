export const runtime = "nodejs";

import { NextRequest } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { checkRoomAccess } from "@/lib/auth-helpers";
import {
  CHAT_IMAGE_MAX_BYTES,
  ensureChatImageDir,
  extForMime,
  isAllowedImageMime,
} from "@/lib/uploads";

/**
 * POST /api/rooms/[id]/images
 * Uploads a single chat image (multipart/form-data, field name "file").
 * Writes it to the server-side cache folder and returns its path URL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const roomId = parseInt(id);
  if (isNaN(roomId)) {
    return Response.json({ error: "Invalid room ID" }, { status: 400 });
  }

  // Authn/authz: must be a room member, and the room must be writable (frozen
  // rooms are read-only for non-hosts).
  try {
    await checkRoomAccess(roomId, false, { requireWritable: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    const status = msg.includes("authenticated") ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isAllowedImageMime(file.type)) {
    return Response.json(
      { error: "Unsupported image type (allowed: JPEG, PNG, GIF, WebP)" },
      { status: 415 }
    );
  }

  if (file.size <= 0 || file.size > CHAT_IMAGE_MAX_BYTES) {
    return Response.json(
      { error: "Image must be larger than 0 and at most 1MB" },
      { status: 413 }
    );
  }

  const ext = extForMime(file.type)!;
  const filename = `${roomId}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  try {
    const dir = await ensureChatImageDir();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Re-check size after reading the actual bytes (defends against a spoofed
    // File.size from the multipart header).
    if (buffer.length > CHAT_IMAGE_MAX_BYTES) {
      return Response.json({ error: "Image is too large (max 1MB)" }, { status: 413 });
    }

    await fs.writeFile(path.join(dir, filename), buffer);
  } catch (err) {
    console.error("[chat-image-upload] Failed to write image:", err);
    return Response.json({ error: "Failed to store image" }, { status: 500 });
  }

  return Response.json({ url: `/api/rooms/${roomId}/images/${filename}` });
}
