"use server";

/**
 * Room background actions: host-side list/activate/rename/delete.
 * Upload runs through the Route Handler (POST /api/rooms/[id]/backgrounds)
 * because it carries multipart binary data; everything else lives here.
 * Design: docs/design/room-background.md.
 *
 * All actions return result objects (never throw) per project convention.
 */

import fs from "fs/promises";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { roomBackgrounds, rooms } from "@/db/schema";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { broadcastToRoom } from "@/lib/events";
import { resolveRoomBackgroundPath, roomBackgroundUrl } from "@/lib/backgrounds";

export interface RoomBackgroundView {
  id: number;
  url: string;
  title: string | null;
  sizeBytes: number;
  createdAt: string;
  active: boolean;
}

async function requireRoomHost(roomId: number): Promise<boolean> {
  try {
    await checkRoomAccess(roomId, true);
    return true;
  } catch {
    return false;
  }
}

function notifyRoom(roomId: number) {
  broadcastToRoom(roomId, { type: "room_settings_updated" });
  revalidatePath(`/rooms/${roomId}`);
}

/** List this room's backgrounds with the active one flagged (host only). */
export async function listRoomBackgroundsAction(roomId: number) {
  const t = await getTranslations("roomBackground");
  if (!Number.isInteger(roomId) || !(await requireRoomHost(roomId))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  const [room] = await db
    .select({ backgroundId: rooms.backgroundId })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  if (!room) return { success: false as const, error: t("errorNotFound") };

  const rows = await db
    .select()
    .from(roomBackgrounds)
    .where(eq(roomBackgrounds.roomId, roomId))
    .orderBy(roomBackgrounds.id);

  const backgrounds: RoomBackgroundView[] = rows.map((r) => ({
    id: r.id,
    url: roomBackgroundUrl(roomId, r.filename),
    title: r.title,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    active: r.id === room.backgroundId,
  }));

  return { success: true as const, backgrounds };
}

/**
 * Activate a background (or pass null to turn the background off).
 * Broadcasts `room_settings_updated` so every member re-renders.
 */
export async function setRoomBackgroundAction(
  roomId: number,
  backgroundId: number | null
) {
  const t = await getTranslations("roomBackground");
  if (!Number.isInteger(roomId) || !(await requireRoomHost(roomId))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  if (backgroundId !== null) {
    if (!Number.isInteger(backgroundId)) {
      return { success: false as const, error: t("errorNotFound") };
    }
    // The background must belong to this room — an id from another room is
    // indistinguishable from a missing one on purpose.
    const [bg] = await db
      .select({ id: roomBackgrounds.id })
      .from(roomBackgrounds)
      .where(and(eq(roomBackgrounds.id, backgroundId), eq(roomBackgrounds.roomId, roomId)));
    if (!bg) return { success: false as const, error: t("errorNotFound") };
  }

  await db.update(rooms).set({ backgroundId }).where(eq(rooms.id, roomId));
  notifyRoom(roomId);
  return { success: true as const };
}

/** Rename a background (≤50 chars; empty clears the title). */
export async function renameRoomBackgroundAction(
  roomId: number,
  backgroundId: number,
  title: string
) {
  const t = await getTranslations("roomBackground");
  if (!Number.isInteger(roomId) || !(await requireRoomHost(roomId))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  const parsed = z.string().trim().max(50).safeParse(title);
  if (!parsed.success) {
    return { success: false as const, error: t("errorTitleTooLong") };
  }

  const [row] = await db
    .update(roomBackgrounds)
    .set({ title: parsed.data || null })
    .where(and(eq(roomBackgrounds.id, backgroundId), eq(roomBackgrounds.roomId, roomId)))
    .returning({ id: roomBackgrounds.id });
  if (!row) return { success: false as const, error: t("errorNotFound") };

  return { success: true as const };
}

/**
 * Delete a background. The DB row is the source of truth: the row goes first
 * (rooms.backgroundId falls back to null via FK `set null`), then the file —
 * a failed file unlink only logs, leaving a harmless orphan on disk.
 */
export async function deleteRoomBackgroundAction(roomId: number, backgroundId: number) {
  const t = await getTranslations("roomBackground");
  if (!Number.isInteger(roomId) || !(await requireRoomHost(roomId))) {
    return { success: false as const, error: t("errorNotHost") };
  }

  // Was it the active one? (Checked before the delete; the FK would null the
  // reference either way, but we only broadcast when the visual changed.)
  const [room] = await db
    .select({ backgroundId: rooms.backgroundId })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  const wasActive = room?.backgroundId === backgroundId;

  const [row] = await db
    .delete(roomBackgrounds)
    .where(and(eq(roomBackgrounds.id, backgroundId), eq(roomBackgrounds.roomId, roomId)))
    .returning({ filename: roomBackgrounds.filename });
  if (!row) return { success: false as const, error: t("errorNotFound") };

  const filePath = resolveRoomBackgroundPath(row.filename);
  if (filePath) {
    await fs.unlink(filePath).catch((err) => {
      console.error("[room-background] Failed to delete file:", err);
    });
  }

  if (wasActive) notifyRoom(roomId);
  return { success: true as const };
}
