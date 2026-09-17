import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_SENSITIVE_WORDS } from "./sensitive-words-constants";

/**
 * Parses raw text settings (line-separated or comma-separated) into a clean list of keywords.
 */
export function parseSensitiveWords(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/)
    .map(w => w.trim())
    .filter(w => w.length > 0);
}

let cachedCustomWords: string[] | null = null;
let cacheExpiresAt = 0;
const CACHE_DURATION = 60000; // 60 seconds

// Promise lock: coalesce concurrent refresh requests into a single DB call
let refreshPromise: Promise<string[]> | null = null;

let cachedEnabled: boolean | null = null;
let enabledExpiresAt = 0;

export function clearSensitiveWordsCache() {
  cachedCustomWords = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
  cachedEnabled = null;
  enabledExpiresAt = 0;
}

/**
 * Whether the sensitive-word filter is enabled. Defaults to enabled —
 * only an explicit "0" disables it, preserving prior always-on behaviour.
 */
export async function isSensitiveFilterEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && enabledExpiresAt > now) {
    return cachedEnabled;
  }
  try {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, "sensitive_words_enabled"));
    cachedEnabled = row?.value !== "0";
    enabledExpiresAt = now + CACHE_DURATION;
    return cachedEnabled;
  } catch {
    return true;
  }
}

/**
 * Fetches the custom sensitive words configured in the admin panel.
 * Uses a promise lock to avoid concurrent DB calls when cache expires.
 */
export async function getCustomSensitiveWords(): Promise<string[]> {
  const now = Date.now();
  if (cachedCustomWords !== null && cacheExpiresAt > now) {
    return cachedCustomWords;
  }

  // If another request is already refreshing, wait for it
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const [row] = await db
        .select({ value: systemConfig.value })
        .from(systemConfig)
        .where(eq(systemConfig.key, "sensitive_words"));

      cachedCustomWords = parseSensitiveWords(row?.value || "");
      cacheExpiresAt = now + CACHE_DURATION;
      return cachedCustomWords;
    } catch {
      // If table isn't migrated or DB not ready
      return [];
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Retrieves the full combined blacklist (default + custom).
 */
export async function getAllSensitiveWords(): Promise<string[]> {
  const custom = await getCustomSensitiveWords();
  const combined = [...DEFAULT_SENSITIVE_WORDS, ...custom];
  // Deduplicate and filter empty
  return Array.from(new Set(combined));
}

/**
 * Scans content for any sensitive keywords.
 * Returns the matched word if found, or null.
 */
export async function checkSensitiveWords(content: string): Promise<string | null> {
  if (!content) return null;
  if (!(await isSensitiveFilterEnabled())) return null;

  const keywords = await getAllSensitiveWords();
  // Normalize Unicode (NFKC) and strip zero-width characters to prevent simple bypasses
  const normalized = content.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  const lowerContent = normalized.toLowerCase();
  
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").toLowerCase();
    if (normalizedKeyword && lowerContent.includes(normalizedKeyword)) {
      return keyword;
    }
  }
  
  return null;
}
