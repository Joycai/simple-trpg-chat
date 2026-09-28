/**
 * Declarative character-sheet schema — what a rule's sheet *is*, as data.
 *
 * Each rule declares its fields once here; reading, editing, clamping,
 * completion, the AI tool schema, exports and every sheet UI are derived from
 * the declaration by the generic functions in `src/lib/character/`. A new
 * ruleset writes a schema plus a `derive` function — no per-rule read/write
 * methods.
 *
 * Four kinds of field:
 *  - attribute: a number the player sets; feeds checks and derivations.
 *  - resource:  a state value — `current / max` (a bar) or an open counter.
 *  - derived:   computed by the rule from attributes; never stored, never set.
 *  - standard skill: a preset row of the rule's skill list (skills themselves
 *    live in `room_skills`; the schema only names them and their base value).
 *
 * Client-safe and dependency-free (the badge function is the only code here).
 */

/** Attribute: a number the player sets, used in checks or derivations. */
export interface AttributeField {
  /** Storage key under `CharacterData.attributes`. */
  key: string;
  /** i18n key under `messages.character`. */
  labelKey: string;
  /** Shorter i18n key for tight surfaces (avatar hover card). */
  shortLabelKey?: string;
  /** Legal range; writes are rounded and clamped into it. */
  min: number;
  max: number;
  /** Value used for checks and derivations while the attribute is unset. */
  default: number;
  /** Counts toward completion when unset. */
  required: boolean;
  /** Also shown in the compact status card (avatar hover). */
  inStatus?: boolean;
  /** Short badge rendered next to the value (狩魂者 E..SSS+). */
  badge?: (value: number) => string;
}

/** Where a resource's upper bound comes from. */
export type ResourceMax =
  /** A value returned by the rule's `derive` (COC HP = (CON+SIZ)/10). */
  | { derived: string }
  /** Set by the player (d20 HP); `default` applies while unset. */
  | { editable: { default?: number; min: number; max: number } };

/** Resource: a state value, `current / max` or an unbounded counter. */
export interface ResourceField {
  /** Storage key under `CharacterData.resources`. */
  key: string;
  labelKey: string;
  /** `"bar"` renders current/max with a fill; `"counter"` a bare stepper. */
  style: "bar" | "counter";
  /** Upper bound. Absent ⇒ no bound (counters) — `cap` still limits writes. */
  max?: ResourceMax;
  /** Lower bound, default 0. */
  min?: number;
  /** Hard write limit when there is no `max` (keeps counters sane). */
  cap?: number;
  /**
   * Current value while unset: `"max"` (full), a fixed number, or a derived
   * value (COC SAN starts at POW, not at its 99 cap).
   */
  initial: "max" | number | { derived: string };
  /**
   * Counts toward completion when unset. For an editable-max resource "set"
   * means the max was set (d20 HP); otherwise it means the current was set.
   */
  required: boolean;
  /** Also shown in the compact status card. Default true. */
  inStatus?: boolean;
}

/** Derived value: computed by the rule's `derive`, read-only. */
export interface DerivedField {
  /** Key in the object `derive` returns. */
  key: string;
  labelKey: string;
  /**
   * Where it shows: the sheet, the status card, both, or nowhere
   * (`"hidden"` — internal inputs such as a resource's max).
   */
  display: "sheet" | "status" | "both" | "hidden";
  /** `"text"` for non-numeric results (COC damage bonus `+1D4`). */
  format?: "number" | "text";
  /** Optional i18n key explaining the formula. */
  formulaKey?: string;
}

/** A preset row of the rule's skill list. */
export interface StandardSkill {
  /** Canonical name, matched against `room_skills.skillName`. */
  name: string;
  /** Base value while unset: a number, or an attribute (optionally divided). */
  base: number | { fromAttribute: string; divisor?: number };
  /** Counts toward completion when unset. */
  required: boolean;
  /** Optional grouping for display. */
  group?: string;
}

export interface SheetSchema {
  attributes: ReadonlyArray<AttributeField>;
  resources: ReadonlyArray<ResourceField>;
  derived: ReadonlyArray<DerivedField>;
  standardSkills?: ReadonlyArray<StandardSkill>;
  /** Profile fields beyond name/age/occupation/bio (d20 role + level). */
  profile: { roleLevel: boolean };
  /**
   * Player-defined attributes. `statusLimit` caps how many the status card
   * shows (basic has nothing else to show there).
   */
  customAttributes: { statusLimit?: number };
}

/** What `derive` returns: numbers, or text for `format: "text"` fields. */
export type DerivedValues = Record<string, number | string>;

/**
 * The part of a rule the generic sheet functions need. `RuleModule` satisfies
 * it; tests use a small fixture instead of a real rule.
 */
export interface SheetRule {
  readonly id: string;
  readonly sheet: SheetSchema;
  /** Pure: attributes (defaults already filled in) → derived values. */
  derive(attributes: Readonly<Record<string, number>>): DerivedValues;
}
