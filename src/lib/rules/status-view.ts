/**
 * Shared flattening for read-only "live status" surfaces.
 *
 * Two places show a character's current numbers without opening the sheet:
 * the chat avatar hover card (a handful of entries) and the member list in the
 * conversation sidebar (exactly one). Both need the same answer to "what does
 * this rule consider this character's status?", so the walk lives here instead
 * of in either component — a new rule declares its sheet schema and both
 * surfaces pick it up with no code change.
 *
 * React-free on purpose: rule modules load on the server, and this module is
 * imported by a server action too. Icons/colors for these keys live in
 * `@/components/room/character/resource-visuals`.
 */

import type { CharacterData } from "@/lib/character/types";
import { resolveSheet } from "@/lib/character/sheet-model";
import { getRule } from "./registry";

/**
 * One displayable number. Exactly one of `labelKey` (i18n key under
 * `messages.character`) / `label` (player-typed name) is set.
 */
export interface StatusEntry {
  key: string;
  labelKey?: string;
  label?: string;
  current: number;
  /** Absent for counters (Triangle's 嘉奖/处分) and max-less custom attributes. */
  max?: number;
  style: "bar" | "counter";
}

export interface StatusEntries {
  /** Rule-preset resources, in schema order. */
  resources: StatusEntry[];
  /** Player-defined attributes, truncated to the rule's `customAttributes.statusLimit`. */
  custom: StatusEntry[];
}

export interface StatusView extends StatusEntries {
  /** Derived values the rule shows in the status card (`display: status | both`). */
  derived: Array<{ key: string; labelKey: string; value: number | string }>;
  /** Attributes the rule marked `inStatus`, with their badge when they have one. */
  attributes: Array<{ key: string; labelKey: string; value: number; grade?: string }>;
}

const EMPTY: StatusView = { resources: [], custom: [], derived: [], attributes: [] };

/** Everything the status card shows for a sheet, in schema order. */
export function readStatusView(charData: CharacterData | null | undefined): StatusView {
  if (!charData) return EMPTY;
  const rule = getRule(charData.ruleTemplate);
  const r = resolveSheet(rule, charData);

  const resources = r.resources
    .filter((res) => res.field.inStatus !== false)
    .map<StatusEntry>((res) => ({
      key: res.field.key,
      labelKey: res.field.labelKey,
      current: res.current,
      max: res.field.style === "counter" ? undefined : res.max,
      style: res.field.style,
    }));

  const limit = rule.sheet.customAttributes.statusLimit;
  const custom = (charData.customAttributes ?? [])
    .slice(0, limit ?? undefined)
    .map<StatusEntry>((attr) => ({
      key: `custom:${attr.name}`,
      label: attr.name,
      current: attr.value,
      max: attr.max,
      style: attr.max !== undefined ? "bar" : "counter",
    }));

  const derived = r.derivedFields
    .filter((d) => d.field.display === "status" || d.field.display === "both")
    .map((d) => ({ key: d.field.key, labelKey: d.field.labelKey, value: d.value }));

  const attributes = r.attributes
    .filter((a) => a.field.inStatus)
    .map((a) => ({
      key: a.field.key,
      labelKey: a.field.shortLabelKey ?? a.field.labelKey,
      value: a.value,
      ...(a.field.badge ? { grade: a.field.badge(a.value) } : {}),
    }));

  return { resources, custom, derived, attributes };
}

/** Resources + custom attributes only (the member list's needs). */
export function readStatusEntries(charData: CharacterData | null | undefined): StatusEntries {
  const { resources, custom } = readStatusView(charData);
  return { resources, custom };
}

/**
 * The single number worth showing next to a name in the member list.
 *
 * HP wins wherever a rule has it (COC / d20 / 狩魂者) — it's the number the
 * table watches. Rules without HP fall back to their first declared resource
 * (Triangle → 嘉奖), and rules with no presets at all fall back to the
 * player's first custom attribute. An untouched sheet (nothing set) has only
 * default-derived numbers, so it shows no resource. Returns null when there is
 * nothing to show, in which case the caller renders no bar at all.
 */
export function primaryVital(charData: CharacterData | null | undefined): StatusEntry | null {
  const { resources, custom } = readStatusEntries(charData);
  // A sheet nobody has filled in would show numbers derived from defaults
  // (a "full" HP 10/10) that look real — show its custom attributes, or nothing.
  const touched = !!charData && (Object.keys(charData.attributes ?? {}).length > 0
    || Object.keys(charData.resources ?? {}).length > 0);
  if (!touched) return custom[0] ?? null;
  return resources.find(r => r.key === "hp") ?? resources[0] ?? custom[0] ?? null;
}
