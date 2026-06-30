"use server";

import { auth } from "@/auth";
import { getStickerManifest, invalidateStickerManifest, type StickerPack } from "@/lib/stickers";

/**
 * Returns the sticker pack manifest (scanned once per process from disk) for the
 * chat sticker picker. Global resource — any authenticated user may read it.
 */
export async function getStickerManifestAction(): Promise<StickerPack[]> {
  const session = await auth();
  if (!session?.user) return [];
  return getStickerManifest();
}

/**
 * Admin-only: drop the cached manifest and rescan the sticker directory on
 * the next read. Used when an admin drops new files into `data/stickers/`
 * without wanting to restart the server. Returns the freshly-rebuilt list so
 * the caller can confirm what was picked up.
 */
export async function refreshStickerManifestAction(): Promise<{ success: boolean; error?: string; packs?: StickerPack[] }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { success: false, error: "Admin only" };
  }
  invalidateStickerManifest();
  return { success: true, packs: getStickerManifest() };
}
