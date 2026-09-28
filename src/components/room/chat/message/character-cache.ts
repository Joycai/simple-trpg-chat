import type { CharacterData } from "@/lib/character/types";

/** LRU-capped cache (max 200 entries) for character resource data, keyed by
 *  `${roomId}-${senderId}` — shared by every chat avatar's hover card, so
 *  hovering the same sender twice fetches once. */
const CHAR_CACHE_MAX = 200;
export const characterCache = new Map<
  string,
  {
    data: CharacterData | null;
    promise?: Promise<CharacterData | null>;
  }
>();

/** Drop a member's cached sheet (it changed; the next hover refetches). */
export function invalidateCharacterCache(roomId: number, userId: number) {
  characterCache.delete(`${roomId}-${userId}`);
}

export function setCacheEntry(key: string, value: { data: CharacterData | null; promise?: Promise<CharacterData | null> }) {
  if (!characterCache.has(key) && characterCache.size >= CHAR_CACHE_MAX) {
    // Evict oldest entry
    const oldest = characterCache.keys().next().value;
    if (oldest !== undefined) characterCache.delete(oldest);
  }
  characterCache.set(key, value);
}
