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

/**
 * Fetches the custom sensitive words configured in the admin panel.
 */
export async function getCustomSensitiveWords(): Promise<string[]> {
  try {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, "sensitive_words"));

    return parseSensitiveWords(row?.value || "");
  } catch {
    // If table isn't migrated or DB not ready
    return [];
  }
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
  
  const keywords = await getAllSensitiveWords();
  const lowerContent = content.toLowerCase();
  
  for (const keyword of keywords) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  
  return null;
}
