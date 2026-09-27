import type { CharacterData } from "@/lib/character/types";
import {
  getRule,
  type CocAttributes, type D20Attributes, type ShAttributes, type TaQualities,
  type RuleCapabilities,
} from "@/lib/rules";

/**
 * Pure helpers behind the character-sheet panel: reading the stored sheet,
 * drafting the rule's live status from edited attributes, and the plain-text
 * export. The panel asks the rule for everything; nothing here names a rule.
 */

export function parseCharData(json?: string | null): Record<string, unknown> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

/**
 * Draft the active rule's live status from the currently-edited attribute
 * values: writeAttributes → computeDerived → readStatus. Gives the panel a
 * generic `{ resources: { current, max }, derived }` snapshot so the resource
 * bars, their denominators, and the derived footer stop calling
 * computeCocDerived / computeShDerived by name (was a per-rule if-chain).
 */
export function draftStatusFor(ruleTemplate: string, sheet: unknown, attributeValues: Record<string, number>) {
  const rule = getRule(ruleTemplate);
  const base = { ...(sheet as CharacterData), ruleTemplate };
  return rule.readStatus(rule.computeDerived(rule.writeAttributes(base, attributeValues)));
}

/** Pull the current value for each of a rule's resource bars from a status snapshot. */
export function currentsFromStatus(ruleTemplate: string, status: { resources: Record<string, { current: number; max?: number }> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bar of getRule(ruleTemplate).capabilities.resourceBars) {
    const r = status.resources[bar.key];
    if (r) out[bar.key] = r.current;
  }
  return out;
}

/**
 * Build the generic `attributeValues: Record<string, number>` record fed to
 * AttributesTab from rule-specific attribute bags. COC → cocAttributes;
 * d20 → d20Attributes; basic → empty.
 */
export function buildAttributeValues(
  ruleTemplate: string,
  coc: CocAttributes | undefined,
  d20: D20Attributes | undefined,
  ta?: TaQualities,
  sh?: ShAttributes,
): Record<string, number> {
  // The rule owns which bag its attributes live in; the panel just asks for a
  // flat record. (Was a coc7th/dnd5e/triangle/shouhun if-chain.)
  return getRule(ruleTemplate).readAttributes({
    ruleTemplate,
    cocAttributes: coc,
    d20Attributes: d20,
    taQualities: ta,
    shAttributes: sh,
  });
}

/**
 * The panel's "导出" text. Driven entirely by capabilities + the rule's status
 * snapshot, so a new rule exports with no edit here (was a
 * coc7th/dnd5e/triangle/shouhun if-chain).
 */
export function buildCharacterExportText({
  t,
  nickname,
  cap,
  role,
  level,
  currentResources,
  resourceMaxes,
  derivedValues,
  attributeGrades,
  attributeValues,
  skills,
  bio,
}: {
  t: (key: string) => string;
  nickname: string;
  cap: RuleCapabilities;
  role: string;
  level: number | "";
  currentResources: Record<string, number>;
  resourceMaxes: Record<string, number>;
  derivedValues: Record<string, number> | undefined;
  attributeGrades: Record<string, string> | undefined;
  attributeValues: Record<string, number>;
  skills: { skillName: string; skillValue: number }[];
  bio: string;
}): string {
  const lines = [`${t("title")} · ${nickname}`, ""];

  // Role / level (only rules that expose them).
  if (cap.hasRoleLevel) {
    if (role) lines.push(`${t("role")}: ${role}`);
    if (level !== "") lines.push(`${t("level")}: ${level}`);
  }

  // Resource bars: `current/max` for bars, bare value for counters.
  for (const bar of cap.resourceBars) {
    const cur = currentResources[bar.key] ?? 0;
    lines.push((bar.style ?? "bar") === "counter"
      ? `${t(bar.labelKey)}: ${cur}`
      : `${t(bar.labelKey)}: ${cur}/${resourceMaxes[bar.key] ?? 0}`);
  }

  // Derived stats (e.g. 狩魂者 术法强度) + 灵识 footer value, if the rule has them.
  for (const d of cap.derivedStats ?? []) {
    lines.push(`${t(d.labelKey)}: ${derivedValues?.[d.key] ?? 0}`);
  }
  if (derivedValues?.spiritSense !== undefined) {
    lines.push(`${t("shSpiritSense")}: ${derivedValues.spiritSense}`);
  }

  // Attributes, with the rule's grade badge appended when it has one.
  if (cap.attributeKeys.length) {
    lines.push("", t("baseAttributes") + ":");
    cap.attributeKeys.forEach(({ key, labelKey }) => {
      const g = attributeGrades?.[key];
      lines.push(`  ${t(labelKey)}: ${attributeValues[key] ?? 0}${g ? ` (${g})` : ""}`);
    });
  }

  if (skills.length) { lines.push("", t("tabSkills") + ":"); skills.forEach((s) => lines.push(`  ${s.skillName}: ${s.skillValue}`)); }
  if (bio.trim()) lines.push("", t("tabBackground") + ":", bio.trim());
  return lines.join("\n");
}
