import type { SheetRule, StandardSkill } from "@/lib/rules/sheet-schema";
import { resolveSheet } from "./sheet-model";
import type { CharacterSheetV2 } from "./sheet-v2";

/**
 * Sheet completion: which declared fields are set, which required ones are
 * still missing, and which values the player added beyond the schema. Drives
 * the panel's completion bar and field states, the top-bar badge and the
 * host's per-member marks — all from one function.
 */

/**
 * - set:     the player (or host) set a value
 * - missing: required and unset
 * - default: optional and unset — reads as the field's default
 * - custom:  added by the player, not declared by the rule
 */
export type FieldState = "set" | "missing" | "default" | "custom";

export interface FieldStatus {
  kind: "attribute" | "resource" | "skill" | "customAttribute";
  /** Field key; for skills the skill name (standard name when matched). */
  key: string;
  state: FieldState;
  required: boolean;
}

/** A required field still unset — its label comes from the rule (`useFieldLabel`). */
export interface MissingField {
  kind: FieldStatus["kind"];
  key: string;
}

interface RequiredCounts {
  requiredTotal: number;
  requiredSet: number;
}

/** What every badge needs: the two numbers, and which fields are missing (for tooltips). */
export interface CompletionSummary extends RequiredCounts {
  /** Required fields still unset, in schema order (`requiredTotal - requiredSet` of them). */
  missing: MissingField[];
}

export interface Completion extends RequiredCounts {
  fields: FieldStatus[];
  skills: { standardTotal: number; standardSet: number; custom: number };
}

/** Optional alternate spellings for a skill name (COC 侦查/侦察). */
export type SkillAliasFn = (name: string) => string[];

/** The value an unset standard skill reads as. */
export function standardSkillBase(skill: StandardSkill, attributes: Record<string, number>): number {
  if (typeof skill.base === "number") return skill.base;
  const v = attributes[skill.base.fromAttribute] ?? 0;
  return Math.floor(v / (skill.base.divisor ?? 1));
}

/**
 * Match stored skill names to a rule's standard skills. Returns, for each
 * stored name, the standard name it fills (or undefined for a custom skill).
 * A stored name matches when it equals the standard name or either is an
 * alias candidate of the other.
 */
export function matchStandardSkills(
  standard: ReadonlyArray<StandardSkill>,
  skillNames: ReadonlyArray<string>,
  aliases?: SkillAliasFn,
): Map<string, string | undefined> {
  const byName = new Set(standard.map((s) => s.name));
  const out = new Map<string, string | undefined>();
  for (const stored of skillNames) {
    if (byName.has(stored)) { out.set(stored, stored); continue; }
    let hit: string | undefined;
    if (aliases) {
      hit = aliases(stored).find((c) => byName.has(c));
      if (!hit) hit = standard.find((s) => aliases(s.name).includes(stored))?.name;
    }
    out.set(stored, hit);
  }
  return out;
}

export function sheetCompletion(
  rule: SheetRule,
  sheet: CharacterSheetV2,
  skillNames: ReadonlyArray<string> = [],
  aliases?: SkillAliasFn,
): Completion {
  const resolved = resolveSheet(rule, sheet);
  const fields: FieldStatus[] = [];
  const state = (isSet: boolean, required: boolean): FieldState =>
    isSet ? "set" : required ? "missing" : "default";

  for (const a of resolved.attributes) {
    fields.push({ kind: "attribute", key: a.field.key, state: state(a.isSet, a.field.required), required: a.field.required });
  }
  for (const r of resolved.resources) {
    fields.push({ kind: "resource", key: r.field.key, state: state(r.isSet, r.field.required), required: r.field.required });
  }

  const standard = rule.sheet.standardSkills ?? [];
  const matches = matchStandardSkills(standard, skillNames, aliases);
  const filled = new Set([...matches.values()].filter((v): v is string => !!v));
  for (const s of standard) {
    fields.push({ kind: "skill", key: s.name, state: state(filled.has(s.name), s.required), required: s.required });
  }
  let custom = 0;
  for (const [name, std] of matches) {
    if (std) continue;
    custom += 1;
    fields.push({ kind: "skill", key: name, state: "custom", required: false });
  }
  for (const c of sheet.customAttributes ?? []) {
    fields.push({ kind: "customAttribute", key: c.name, state: "custom", required: false });
  }

  const required = fields.filter((f) => f.required);
  return {
    requiredTotal: required.length,
    requiredSet: required.filter((f) => f.state === "set").length,
    fields,
    skills: {
      standardTotal: standard.length,
      standardSet: standard.filter((s) => filled.has(s.name)).length,
      custom,
    },
  };
}

/** Required fields still unset, in schema order. */
export function missingFields(completion: Completion): FieldStatus[] {
  return completion.fields.filter((f) => f.state === "missing");
}

export function summarize(completion: Completion): CompletionSummary {
  return {
    requiredTotal: completion.requiredTotal,
    requiredSet: completion.requiredSet,
    missing: missingFields(completion).map((f) => ({ kind: f.kind, key: f.key })),
  };
}
