"use server";

import { auth } from "@/auth";
import { getStickerManifest, type StickerPack } from "@/lib/stickers";

/**
 * Returns the sticker pack manifest (scanned once per process from disk) for the
 * chat sticker picker. Global resource — any authenticated user may read it.
 */
export async function getStickerManifestAction(): Promise<StickerPack[]> {
  const session = await auth();
  if (!session?.user) return [];
  return getStickerManifest();
}
