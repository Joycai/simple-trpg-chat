import type { CharacterData } from "@/lib/character-types";

/**
 * Fields that describe the *person*, not the ruleset — they survive a rebuild
 * when the room switches rule templates. Everything else on the sheet
 * (cocAttributes / d20Sheet / taSheet / shSheet / derived values / resource
 * bars) is rule-specific and comes fresh from `rule.initCharacter()`.
 *
 * `resources` is deliberately absent: resource bars are driven by the rule's
 * capabilities, so carrying the old rule's bars over would resurrect e.g. a
 * SAN bar in a system that has no sanity.
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
 * Rebuild a character sheet for a new rule template.
 *
 * `fresh` must be the output of `rule.initCharacter()` for the room's *current*
 * rule — this function never inspects rule ids, so adding a ruleset requires no
 * change here. Only the generic profile fields listed in `CARRYOVER_KEYS` are
 * copied over from the previous sheet; skills live in the `room_skills` table
 * and are untouched either way.
 */
export function rebuildSheetForRule(
  prev: CharacterData | null | undefined,
  fresh: CharacterData
): CharacterData {
  if (!prev) return fresh;

  const out: CharacterData = { ...fresh };
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
