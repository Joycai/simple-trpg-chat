/**
 * Shared flattening for read-only "live status" surfaces.
 *
 * Two places show a character's current numbers without opening the sheet:
 * the chat avatar hover card (a handful of entries) and the member list in the
 * conversation sidebar (exactly one). Both need the same answer to "what does
 * this rule consider this character's status?", so the walk lives here instead
 * of in either component — a new rule declares its capabilities plus
 * `readStatus`, and both surfaces pick it up with no code change.
 *
 * React-free on purpose: rule modules load on the server, and this module is
 * imported by a server action too. Icons/colors for these keys live in
 * `@/components/room/character/resource-visuals`.
 */

import type { CharacterData } from "@/lib/character-types";
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
  /** Rule-preset resources, in the order `resourceBars` declares them. */
  resources: StatusEntry[];
  /** Player-defined attributes, truncated to the rule's `statusCustomLimit`. */
  custom: StatusEntry[];
}

/**
 * Rule-preset resources the sheet actually has values for, plus the custom
 * attributes the player typed. A resource whose key `readStatus` omitted is
 * skipped entirely — an uninitialized sheet shows nothing rather than zeros.
 */
export function readStatusEntries(charData: CharacterData | null | undefined): StatusEntries {
  if (!charData) return { resources: [], custom: [] };
  const rule = getRule(charData.ruleTemplate);
  const status = rule.readStatus(charData);

  const resources = rule.capabilities.resourceBars.flatMap<StatusEntry>(spec => {
    const v = status.resources[spec.key];
    if (!v) return [];
    const style = spec.style ?? "bar";
    return [{
      key: spec.key,
      labelKey: spec.labelKey,
      current: v.current,
      max: style === "counter" ? undefined : v.max,
      style,
    }];
  });

  const limit = rule.capabilities.statusCustomLimit;
  const custom = (charData.customAttributes ?? [])
    .slice(0, limit ?? undefined)
    .map<StatusEntry>(attr => ({
      key: `custom:${attr.name}`,
      label: attr.name,
      current: attr.value,
      max: attr.max,
      style: attr.max !== undefined ? "bar" : "counter",
    }));

  return { resources, custom };
}

/**
 * The single number worth showing next to a name in the member list.
 *
 * HP wins wherever a rule has it (COC / d20 / 狩魂者) — it's the number the
 * table watches. Rules without HP fall back to their first declared resource
 * (Triangle → 嘉奖), and rules with no presets at all fall back to the
 * player's first custom attribute. Returns null when there is nothing to show,
 * in which case the caller renders no bar at all.
 */
export function primaryVital(charData: CharacterData | null | undefined): StatusEntry | null {
  const { resources, custom } = readStatusEntries(charData);
  return resources.find(r => r.key === "hp") ?? resources[0] ?? custom[0] ?? null;
}
