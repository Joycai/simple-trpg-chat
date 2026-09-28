import { getRule } from "@/lib/rules/registry";
import type { LegacySheet } from "./legacy";
import { normalizeSheet } from "./sheet-model";
import { emptySheet } from "./sheet-v2";
import { CHARACTER_DATA_MAX_BYTES, type CharacterData } from "./types";

/**
 * The one way a stored sheet is read. Accepts the `character_data` column
 * (a JSON string) or an already-parsed object, upgrades pre-v2 rows through
 * their own rule's `migrateLegacy`, and brings the result in line with the
 * rule's schema. Everything downstream only ever sees a v2 sheet.
 *
 * Client-safe: the panel and the hover card parse with it too.
 */

function toObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Parse a stored sheet, or null when there is no usable one (nothing stored,
 * unparsable JSON, or a row that never got a rule) — callers that seed a
 * fresh sheet in that case (`ensureCharacterSheetAction`) need to tell.
 *
 * `roomRuleId` resolves pre-v2 rows that hold two rules' bags: bots were
 * never rebuilt when a room switched rules, and a player could decline the
 * rebuild, while `.st` and the AI tool kept writing the *room* rule's bag.
 * When such a row's own rule differs from the room's and the room rule's bag
 * carries data, that bag is what checks and writes were actually using, so
 * the row upgrades under the room rule.
 */
export function parseSheetOrNull(raw: unknown, roomRuleId?: string): CharacterData | null {
  const obj = toObject(raw);
  if (!obj || typeof obj.ruleTemplate !== "string" || !obj.ruleTemplate) return null;

  if (obj.schemaVersion === 2) {
    const v2 = {
      ...(obj as unknown as CharacterData),
      attributes: (toObject(obj.attributes) as Record<string, number> | null) ?? {},
      resources: (toObject(obj.resources) as CharacterData["resources"] | null) ?? {},
    };
    // Keep the stored rule id even when it's no longer registered, so a rule
    // mismatch stays visible to the caller.
    return { ...normalizeSheet(getRule(obj.ruleTemplate), v2), ruleTemplate: obj.ruleTemplate };
  }

  const legacy = obj as LegacySheet;
  if (roomRuleId && roomRuleId !== obj.ruleTemplate) {
    const roomRule = getRule(roomRuleId);
    const asRoom = roomRule.migrateLegacy(legacy);
    if (Object.keys(asRoom.attributes).length > 0 || Object.keys(asRoom.resources).length > 0) {
      return normalizeSheet(roomRule, asRoom);
    }
  }
  const rule = getRule(obj.ruleTemplate);
  return { ...normalizeSheet(rule, rule.migrateLegacy(legacy)), ruleTemplate: obj.ruleTemplate };
}

/** Parse a stored sheet, falling back to an empty sheet for `fallbackRuleId`. */
export function parseSheet(raw: unknown, fallbackRuleId: string): CharacterData {
  return parseSheetOrNull(raw, fallbackRuleId) ?? emptySheet(getRule(fallbackRuleId).id);
}

/**
 * Serialize for persistence, or null when the sheet exceeds
 * `CHARACTER_DATA_MAX_BYTES` (the caller reports "too large").
 */
export function serializeSheet(sheet: CharacterData): string | null {
  const json = JSON.stringify(sheet);
  return json.length > CHARACTER_DATA_MAX_BYTES ? null : json;
}
