export const runtime = "nodejs";

import { NextRequest } from "next/server";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomBackgrounds } from "@/db/schema";
import { checkRoomAccess } from "@/lib/auth-helpers";
import {
  BACKGROUND_UPLOAD_MAX_BYTES,
  ROOM_BACKGROUND_MAX_COUNT,
  compressBackgroundToWebp,
  ensureRoomBackgroundDir,
  isAllowedBackgroundMime,
  roomBackgroundUrl,
} from "@/lib/backgrounds";

/**
 * POST /api/rooms/[id]/backgrounds
 * Host-only: uploads a room background (multipart/form-data, field "file",
 * optional field "title"). The original (≤5MB, JPEG/PNG/WebP — GIF rejected)
 * is re-encoded to a bounded WebP before anything touches the disk, then a
 * `room_backgrounds` row is inserted. Returns { id, url, title, sizeBytes }.
 *
 * See docs/design/room-background.md.
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

  // Backgrounds are host prep material — host only (admins pass through).
  try {
    await checkRoomAccess(roomId, true);
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

  if (!isAllowedBackgroundMime(file.type)) {
    return Response.json(
      { error: "Unsupported image type (allowed: JPEG, PNG, WebP — GIF is not accepted)" },
      { status: 415 }
    );
  }

  if (file.size <= 0 || file.size > BACKGROUND_UPLOAD_MAX_BYTES) {
    return Response.json(
      { error: "Image must be larger than 0 and at most 5MB" },
      { status: 413 }
    );
  }

  const rawTitle = formData.get("title");
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim().slice(0, 50)
      : null;

  // Per-room cap. (Benign race between the count and the insert if the host
  // uploads from two tabs at once — worst case the cap is exceeded by one,
  // which is cosmetic, so we skip a transaction with a table lock.)
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(roomBackgrounds)
    .where(eq(roomBackgrounds.roomId, roomId));
  if (existing >= ROOM_BACKGROUND_MAX_COUNT) {
    return Response.json(
      { error: `Background limit reached (max ${ROOM_BACKGROUND_MAX_COUNT} per room)` },
      { status: 409 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Re-check size after reading the actual bytes (defends against a spoofed
  // File.size from the multipart header).
  if (buffer.length > BACKGROUND_UPLOAD_MAX_BYTES) {
    return Response.json({ error: "Image is too large (max 5MB)" }, { status: 413 });
  }

  // Re-encode: bounded WebP, EXIF applied then dropped. Decode failure means
  // the bytes weren't a real image regardless of the claimed MIME.
  let webp: Buffer;
  try {
    webp = await compressBackgroundToWebp(buffer);
  } catch {
    return Response.json({ error: "File is not a decodable image" }, { status: 415 });
  }

  const filename = `${roomId}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.webp`;

  let dir: string;
  try {
    dir = await ensureRoomBackgroundDir();
    await fs.writeFile(path.join(dir, filename), webp);
  } catch (err) {
    console.error("[room-background-upload] Failed to write file:", err);
    return Response.json({ error: "Failed to store image" }, { status: 500 });
  }

  // File first, row second: if the insert fails, remove the orphan file so
  // disk and DB stay in lockstep (DB rows are the source of truth).
  try {
    const [row] = await db
      .insert(roomBackgrounds)
      .values({ roomId, filename, title, sizeBytes: webp.length })
      .returning();
    return Response.json({
      id: row.id,
      url: roomBackgroundUrl(roomId, filename),
      title: row.title,
      sizeBytes: row.sizeBytes,
    });
  } catch (err) {
    console.error("[room-background-upload] Insert failed, removing file:", err);
    await fs.unlink(path.join(dir, filename)).catch(() => {});
    return Response.json({ error: "Failed to store image" }, { status: 500 });
  }
}

/**
 * GET /api/rooms/[id]/backgrounds
 * Room members: list this room's backgrounds (used by the host management
 * grid; harmless for players). Returns { backgrounds: [...] }.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const roomId = parseInt(id);
  if (isNaN(roomId)) {
    return Response.json({ error: "Invalid room ID" }, { status: 400 });
  }

  try {
    await checkRoomAccess(roomId, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Forbidden";
    const status = msg.includes("authenticated") ? 401 : 403;
    return Response.json({ error: msg }, { status });
  }

  const rows = await db
    .select()
    .from(roomBackgrounds)
    .where(and(eq(roomBackgrounds.roomId, roomId)))
    .orderBy(roomBackgrounds.id);

  return Response.json({
    backgrounds: rows.map((r) => ({
      id: r.id,
      url: roomBackgroundUrl(roomId, r.filename),
      title: r.title,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    })),
  });
}
