import type { CustomAttribute } from "./types";

/**
 * The v2 character sheet: one rule-agnostic shape for every ruleset.
 *
 * Numbers are keyed by the field keys the rule's `SheetSchema` declares, and
 * only values someone actually set are stored — an absent key means "unset"
 * (read as the field's default). That is what lets completion tell "the
 * player chose 50" apart from "nobody touched it". Derived values are never
 * stored; they are recomputed from attributes on every read.
 */
export interface ResourceValue {
  current?: number;
  /** Only for resources whose max is `editable`. */
  max?: number;
}

export interface CharacterSheetV2 {
  schemaVersion: 2;
  /** Rule id — resolves to a RuleModule via `getRule`. */
  ruleTemplate: string;
  /**
   * Write counter, bumped by `updateSheetRow` on every stored write (absent =
   * never written since it was added). Tells a client which of two copies
   * it holds is newer — a save's reply or a page refresh that raced it.
   */
  rev?: number;

  // Profile — survives a rule switch.
  name?: string;
  age?: number;
  occupation?: string;
  bio?: string;
  avatarUrl?: string;
  /** d20 class / role (rules with `profile.roleLevel`). */
  role?: string;
  level?: number;

  /** Attribute values the player set, keyed by `AttributeField.key`. */
  attributes: Record<string, number>;
  /** Resource values the player set, keyed by `ResourceField.key`. */
  resources: Record<string, ResourceValue>;
  customAttributes?: CustomAttribute[];
}

/** Profile keys an edit may change, with their caps. */
export const PROFILE_TEXT_LIMITS = {
  name: 50,
  occupation: 100,
  bio: 10000,
  role: 100,
} as const;
export const PROFILE_AGE_RANGE = { min: 0, max: 999 } as const;
export const PROFILE_LEVEL_RANGE = { min: 0, max: 99 } as const;

/** Custom attribute caps. */
export const CUSTOM_ATTRIBUTE_LIMITS = {
  count: 50,
  nameLength: 40,
  valueAbs: 99999,
} as const;

export type ProfileEdit = {
  name?: string | null;
  age?: number | null;
  occupation?: string | null;
  bio?: string | null;
  role?: string | null;
  level?: number | null;
};

/**
 * A change to a sheet. Every writer — the panel, a host, `.st`, `.sc`, the AI
 * tool — expresses its change as one of these and hands it to
 * `applySheetEdit`, the single place that validates and clamps. `null` clears
 * a value back to unset.
 */
export interface SheetEdit {
  attributes?: Record<string, number | null>;
  /**
   * `current` sets a resource; `delta` changes it relative to the value the
   * sheet holds when the edit is applied — under the row lock, so a relative
   * change (`.sc`, the overview ±) never overwrites a write it didn't see.
   * `current` wins when both are given.
   */
  resources?: Record<string, { current?: number | null; delta?: number; max?: number | null }>;
  profile?: ProfileEdit;
  /** Replaces the whole list. */
  customAttributes?: CustomAttribute[];
}

/** A fresh, empty sheet for a rule: nothing set. */
export function emptySheet(ruleId: string): CharacterSheetV2 {
  return { schemaVersion: 2, ruleTemplate: ruleId, attributes: {}, resources: {} };
}
