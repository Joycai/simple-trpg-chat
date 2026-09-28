import type { CharacterData } from "@/lib/character/types";
import { emptySheet } from "./sheet-v2";

/**
 * Fields that describe the *person*, not the ruleset — they survive a rebuild
 * when the room switches rule templates. Attributes and resources are keyed
 * by the old rule's schema, so they start empty under the new rule.
 */
export const CARRYOVER_KEYS = [
  "name",
  "age",
  "occupation",
  "bio",
  "avatarUrl",
  "customAttributes",
] as const;

/**
 * Rebuild a character sheet for a new rule template: an empty sheet for
 * `ruleId` plus the profile fields listed in `CARRYOVER_KEYS`. This function
 * never inspects rule ids, so adding a ruleset requires no change here;
 * skills live in the `room_skills` table and are untouched either way.
 */
export function rebuildSheetForRule(prev: CharacterData | null | undefined, ruleId: string): CharacterData {
  const out = emptySheet(ruleId);
  if (!prev) return out;
  for (const key of CARRYOVER_KEYS) {
    const value = prev[key];
    if (value !== undefined) {
      // Each key is assigned from the same key of a CharacterData, so the value
      // type always matches — TS can't express that through a loop variable.
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
