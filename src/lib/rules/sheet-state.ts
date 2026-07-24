import type { CharacterData } from "@/lib/character-types";
import type { RuleModule } from "./types";

/**
 * Whether this rule uses a structured character sheet (an attribute grid).
 * True for coc7th/dnd5e/triangle/shouhun; false for basic (通用 d100), which
 * has no predefined attributes. This is the single clean separator that drives
 * the "set up your character" hints — rules without a sheet never nudge.
 */
export function ruleUsesStructuredSheet(rule: RuleModule): boolean {
  return rule.capabilities.attributeKeys.length > 0;
}

/**
 * Whether the sheet's attributes are still at the rule's initial defaults —
 * i.e. the player hasn't customized any attribute. A null/uninitialized sheet
 * counts as unset. Always false for rules without a structured sheet.
 *
 * There is no explicit "edited" flag on the sheet, and initCharacter() seeds
 * non-empty defaults (COC all 50, DnD all 10, …), so "unset" is defined as
 * "every attribute equals its freshly-initialized default value". Comparing
 * against `readAttributes(initCharacter())` keeps this rule-agnostic — no
 * per-rule default is hardcoded here.
 */
export function attributesUnset(sheet: CharacterData | null, rule: RuleModule): boolean {
  if (!ruleUsesStructuredSheet(rule)) return false;
  if (!sheet) return true;
  const current = rule.readAttributes(sheet);
  const defaults = rule.readAttributes(rule.initCharacter());
  return rule.capabilities.attributeKeys.every(
    (k) => (current[k.key] ?? 0) === (defaults[k.key] ?? 0),
  );
}
