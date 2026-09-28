import type { CocAttributes, CocDerived } from "@/lib/rules/coc7th/sheet";
import type { D20Attributes, D20Sheet } from "@/lib/rules/dnd5e/sheet";
import type { TaQualities, TaSheet } from "@/lib/rules/triangle/sheet";
import type { ShAttributes, ShSheet } from "@/lib/rules/shouhun/sheet";
import type { CustomAttribute } from "./types";
import { emptySheet, type CharacterSheetV2 } from "./sheet-v2";

/**
 * The pre-v2 sheet: generic profile fields plus one bag per ruleset. Kept
 * only so old rows can be read and upgraded (`RuleModule.migrateLegacy`,
 * `parseSheet`, the backfill script) — nothing writes this shape any more.
 */
export interface LegacySheet {
  schemaVersion?: undefined;
  ruleTemplate?: string;
  name?: string;
  age?: number;
  occupation?: string;
  bio?: string;
  avatarUrl?: string;
  cocAttributes?: Partial<CocAttributes>;
  cocDerived?: Partial<CocDerived>;
  d20Attributes?: Partial<D20Attributes>;
  d20Sheet?: D20Sheet;
  taQualities?: Partial<TaQualities>;
  taSheet?: TaSheet;
  shAttributes?: Partial<ShAttributes>;
  shSheet?: ShSheet;
  customAttributes?: CustomAttribute[];
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Which legacy attributes count as "set". Old sheets were seeded with every
 * default (COC all 50), so the stored numbers alone can't say what the
 * player chose. The panel always saved the whole grid, so:
 *  - every value equals its default → nothing was set;
 *  - any value differs              → the player worked the grid: all set.
 * A value that isn't a finite number is never kept.
 */
export function legacyAttributes(
  bag: Record<string, unknown> | undefined,
  defaults: Record<string, number>,
): Record<string, number> {
  if (!bag) return {};
  const keys = Object.keys(defaults);
  const touched = keys.some((k) => isNum(bag[k]) && bag[k] !== defaults[k]);
  if (!touched) return {};
  const out: Record<string, number> = {};
  for (const k of keys) if (isNum(bag[k])) out[k] = bag[k] as number;
  return out;
}

/** Whether the legacy grid was worked at all (see `legacyAttributes`). */
export function legacyAttributesTouched(
  bag: Record<string, unknown> | undefined,
  defaults: Record<string, number>,
): boolean {
  return Object.keys(legacyAttributes(bag, defaults)).length > 0;
}

/**
 * A legacy resource current worth keeping. Every stored number is kept, as
 * the old code never moved it again — except on a card whose attribute grid
 * was never worked (`attrsTouched` false), where a current equal to what the
 * v2 sheet reads while unset was only the seed: dropping it keeps an untouched
 * card "unset" (its SAN then starts at POW once POW is set, as a new card's
 * would).
 */
export function legacyCurrent(value: unknown, initial: number, attrsTouched: boolean): number | undefined {
  if (!isNum(value)) return undefined;
  return !attrsTouched && value === initial ? undefined : value;
}

/** The rule-agnostic part of an upgrade: profile + custom attributes. */
export function legacyBase(legacy: LegacySheet, ruleId: string): CharacterSheetV2 {
  const out = emptySheet(ruleId);
  if (typeof legacy.name === "string" && legacy.name) out.name = legacy.name;
  if (isNum(legacy.age)) out.age = legacy.age;
  if (typeof legacy.occupation === "string" && legacy.occupation) out.occupation = legacy.occupation;
  if (typeof legacy.bio === "string" && legacy.bio) out.bio = legacy.bio;
  if (typeof legacy.avatarUrl === "string" && legacy.avatarUrl) out.avatarUrl = legacy.avatarUrl;
  if (Array.isArray(legacy.customAttributes) && legacy.customAttributes.length > 0) {
    out.customAttributes = legacy.customAttributes;
  }
  return out;
}

/** Put a resource value on a sheet only when it carries something. */
export function setResource(sheet: CharacterSheetV2, key: string, value: { current?: number; max?: number }): void {
  const v: { current?: number; max?: number } = {};
  if (value.current !== undefined) v.current = value.current;
  if (value.max !== undefined) v.max = value.max;
  if (v.current !== undefined || v.max !== undefined) sheet.resources[key] = v;
}
