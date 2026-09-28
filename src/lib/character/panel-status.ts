import type { SheetRule } from "@/lib/rules/sheet-schema";
import type { ResolvedSheet } from "./sheet-model";

/**
 * The panel's "导出" text: a readable summary of the sheet as it is being
 * edited. Driven entirely by the rule's schema and the resolved sheet, so a
 * new rule exports with no edit here.
 */
export function buildCharacterExportText({
  t,
  nickname,
  rule,
  resolved,
  skills,
}: {
  t: (key: string) => string;
  nickname: string;
  rule: SheetRule;
  resolved: ResolvedSheet;
  skills: { skillName: string; skillValue: number }[];
}): string {
  const { sheet } = resolved;
  const lines = [`${t("title")} · ${nickname}`, ""];

  // Role / level (only rules that expose them).
  if (rule.sheet.profile.roleLevel) {
    if (sheet.role) lines.push(`${t("role")}: ${sheet.role}`);
    if (sheet.level !== undefined) lines.push(`${t("level")}: ${sheet.level}`);
  }

  // Resources: `current/max` for bounded ones, bare value for counters.
  for (const r of resolved.resources) {
    lines.push(r.max === undefined
      ? `${t(r.field.labelKey)}: ${r.current}`
      : `${t(r.field.labelKey)}: ${r.current}/${r.max}`);
  }

  // Displayed derived values (e.g. 狩魂者 术法强度 / 灵识, COC MOV / DB).
  for (const d of resolved.derivedFields) {
    if (d.field.display === "hidden") continue;
    lines.push(`${t(d.field.labelKey)}: ${d.value}`);
  }

  // Attributes, with the rule's badge appended when it has one.
  if (resolved.attributes.length) {
    lines.push("", t("baseAttributes") + ":");
    for (const a of resolved.attributes) {
      const badge = a.field.badge?.(a.value);
      lines.push(`  ${t(a.field.labelKey)}: ${a.value}${badge ? ` (${badge})` : ""}`);
    }
  }

  if (skills.length) { lines.push("", t("tabSkills") + ":"); skills.forEach((s) => lines.push(`  ${s.skillName}: ${s.skillValue}`)); }
  const bio = sheet.bio?.trim();
  if (bio) lines.push("", t("tabBackground") + ":", bio);
  return lines.join("\n");
}
