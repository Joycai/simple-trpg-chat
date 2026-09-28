import type { SheetRule } from "@/lib/rules/sheet-schema";
import { matchStandardSkills, standardSkillBase, type FieldState, type SkillAliasFn } from "./completion";
import { attributeValues } from "./sheet-model";
import type { CharacterData } from "./types";

/**
 * The 技能 tab's rows: the rule's standard skills (in schema order, each
 * filled by a stored skill when one matches, alias spellings included) and
 * then the member's other, custom skills. Pure, so filtering and counting
 * are tested without React.
 */

export interface StoredSkill {
  id: number;
  skillName: string;
  skillValue: number;
}

export interface SkillRow {
  /** Standard name, or the stored name for a custom skill. */
  name: string;
  kind: "standard" | "custom";
  required: boolean;
  state: FieldState;
  /** The stored row filling this skill, when there is one. */
  stored?: StoredSkill;
  /** What an unset standard skill reads as. */
  base?: number;
  group?: string;
}

export type SkillFilter = "all" | "set" | "unset" | "custom";

export function buildSkillRows(
  rule: SheetRule,
  sheet: CharacterData,
  skills: ReadonlyArray<StoredSkill>,
  aliases?: SkillAliasFn,
): SkillRow[] {
  const standard = rule.sheet.standardSkills ?? [];
  const attrs = attributeValues(rule, sheet);
  const matches = matchStandardSkills(standard, skills.map((s) => s.skillName), aliases);
  const byStandard = new Map<string, StoredSkill>();
  for (const s of skills) {
    const std = matches.get(s.skillName);
    // An exact-name row wins over an alias row for the same standard skill.
    if (std && (!byStandard.has(std) || s.skillName === std)) byStandard.set(std, s);
  }

  const rows: SkillRow[] = standard.map((s) => {
    const stored = byStandard.get(s.name);
    return {
      name: s.name,
      kind: "standard",
      required: s.required,
      state: stored ? "set" : s.required ? "missing" : "default",
      stored,
      base: standardSkillBase(s, attrs),
      group: s.group,
    };
  });
  const custom = skills
    .filter((s) => !matches.get(s.skillName))
    .sort((a, b) => a.skillName.localeCompare(b.skillName, "zh") || a.id - b.id);
  for (const s of custom) {
    rows.push({ name: s.skillName, kind: "custom", required: false, state: "custom", stored: s });
  }
  return rows;
}

export function matchesFilter(row: SkillRow, filter: SkillFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "set": return !!row.stored;
    case "unset": return !row.stored;
    case "custom": return row.kind === "custom";
  }
}

export function filterSkillRows(rows: ReadonlyArray<SkillRow>, filter: SkillFilter, query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => matchesFilter(r, filter) && (!q || r.name.toLowerCase().includes(q)));
}

export function skillFilterCounts(rows: ReadonlyArray<SkillRow>): Record<SkillFilter, number> {
  return {
    all: rows.length,
    set: rows.filter((r) => matchesFilter(r, "set")).length,
    unset: rows.filter((r) => matchesFilter(r, "unset")).length,
    custom: rows.filter((r) => matchesFilter(r, "custom")).length,
  };
}

/** Whether a typed name is new (no row of that name), i.e. worth offering "add". */
export function isNewSkillName(rows: ReadonlyArray<SkillRow>, name: string): boolean {
  const n = name.trim();
  return !!n && !rows.some((r) => r.name === n || r.stored?.skillName === n);
}
