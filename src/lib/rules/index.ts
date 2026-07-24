export type {
  AiRuleHints,
  AttributeKeySpec,
  CharacterStatus,
  CheckMenuMode,
  CheckRequest,
  CheckResult,
  ResourceBarSpec,
  ResourcePatch,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "./types";
export { basicRule } from "./basic";
export { coc7thRule } from "./coc7th";
export { dnd5eRule } from "./dnd5e";
export { shouhunRule } from "./shouhun";
export { triangleRule } from "./triangle";
export { getRule, getRuleForRoom, listRules, listRuleIds, DEFAULT_RULE_ID } from "./registry";
export { clampAttributes, clampInt } from "./patch-utils";
export type { StatusEntries, StatusEntry } from "./status-view";
export { primaryVital, readStatusEntries } from "./status-view";
export { ruleUsesStructuredSheet, attributesUnset } from "./sheet-state";

// Per-rule character-sheet data models (types + defaults + derivation helpers).
// Each ruleset owns its own sheet under `rules/<id>/sheet.ts`; re-exported here
// so external code imports them from the `@/lib/rules` barrel, not a sub-path.
export type { CocAttributes, CocDerived } from "./coc7th/sheet";
export { COC_DEFAULT_ATTRIBUTES, COC_MAX_SANITY, computeCocDerived } from "./coc7th/sheet";
export type { D20Attributes, D20Sheet } from "./dnd5e/sheet";
export { D20_DEFAULT_ATTRIBUTES } from "./dnd5e/sheet";
export type { TaQualities, TaSheet } from "./triangle/sheet";
export { TA_DEFAULT_QUALITIES } from "./triangle/sheet";
export type { ShAttributes, ShSheet, ShDerived } from "./shouhun/sheet";
export { SH_GRADE_LABELS, SH_DEFAULT_ATTRIBUTES, clampShAttr, shGradeLabel, computeShDerived } from "./shouhun/sheet";
