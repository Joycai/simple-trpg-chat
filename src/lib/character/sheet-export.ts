import type { SheetRule } from "@/lib/rules/sheet-schema";
import { resolveSheet } from "./sheet-model";
import type { CharacterData } from "./types";

/**
 * A rule-agnostic snapshot of a sheet's numbers for reports: the room export
 * (JSON + markdown) and the AI's `my_character` tool. Built from the schema,
 * so every rule reports the same shape.
 */
export interface SheetSnapshot {
  rule: string;
  /** Every declared attribute, defaults filled in. */
  attributes: Record<string, number>;
  /** Declared attributes nobody set yet (they read as their defaults). */
  unsetAttributes: string[];
  /** Declared resources in schema order; `label` when the caller resolved one. */
  resources: Array<{ key: string; label?: string; current: number; max?: number }>;
  /** Displayed derived values (hidden internals omitted). */
  derived: Record<string, number | string>;
  role?: string;
  level?: number;
}

export function sheetSnapshot(
  rule: SheetRule,
  sheet: CharacterData,
  label?: (labelKey: string) => string,
): SheetSnapshot {
  const r = resolveSheet(rule, sheet);
  const out: SheetSnapshot = {
    rule: rule.id,
    attributes: r.attributeValues,
    unsetAttributes: r.attributes.filter((a) => !a.isSet).map((a) => a.field.key),
    resources: r.resources.map((res) => ({
      key: res.field.key,
      ...(label ? { label: label(res.field.labelKey) } : {}),
      current: res.current,
      ...(res.max !== undefined ? { max: res.max } : {}),
    })),
    derived: Object.fromEntries(
      r.derivedFields.filter((d) => d.field.display !== "hidden").map((d) => [d.field.key, d.value]),
    ),
  };
  if (rule.sheet.profile.roleLevel) {
    if (sheet.role) out.role = sheet.role;
    if (sheet.level !== undefined) out.level = sheet.level;
  }
  return out;
}
