/**
 * Rule-template module interface — the central abstraction that decouples the
 * chat engine, character system, and UI from any specific TRPG ruleset.
 *
 * Each ruleset (basic d100, COC 7th, future DnD 5e…) implements `RuleModule`
 * and self-registers in `src/lib/rules/registry.ts`. Call sites obtain a
 * module via `getRule(room.ruleTemplate)` and never branch on the rule id.
 *
 * Design constraints captured here:
 *  - `resolveCheck` is owned by the rule (it rolls, adds mods, decides the
 *    comparison direction). d20-style "≥ DC" and d100-style "≤ threshold"
 *    both fit because the engine never assumes a direction.
 *  - `routeStat` decides whether a `.st <name> <val>` writes to room_skills,
 *    a character attribute, or a resource — the COC quirk (force "san" onto
 *    the sheet) lives inside the COC module, not the engine.
 *  - `capabilities` is a flat data object so client components, server
 *    actions, and AI helpers can all drive their feature gates from one
 *    source without importing rule-specific code.
 *  - `VisualGrade` is the closed vocabulary the chat renderer understands.
 *    Future systems with extra tiers (PbtA strong/weak hit) will extend
 *    this vocabulary in lockstep with `ChatMessage.tsx`.
 */

import type { CharacterData } from "@/lib/character-types";

// ---------------------------------------------------------------------------
// Check resolution
// ---------------------------------------------------------------------------

/** Closed vocabulary the chat bubble understands. */
export type VisualGrade = "critical" | "success" | "failure" | "fumble";

/**
 * One evaluated term of a `.rc` modifier expression, with per-die results.
 * Produced by the engine's `parseAndRollExpression` so rules can render
 * individual die faces (e.g. 狩魂者 shows `2d4[3, 4] + 1d6[2]`, not just the
 * summed modifier).
 */
export interface ModifierTerm {
  sign: "+" | "-";
  /** Dice count (0 for constant terms). */
  count: number;
  /** Die faces (0 for constant terms). */
  faces: number;
  /** Individual die results, in roll order (empty for constant terms). */
  rolls: ReadonlyArray<number>;
  /** Term subtotal before the sign is applied. */
  sum: number;
  /** True when the term is a flat number, not dice. */
  isConstant: boolean;
}

export interface CheckRequest {
  /** Display name to show in the check bubble (already canonicalized). */
  skillName: string;
  /**
   * Numeric target. Semantics depend on the rule:
   *  - COC d100: skill threshold (lower roll = success).
   *  - DnD 5e d20: DC (higher total = success).
   * The engine has already resolved this from room_skills or the rule's
   * `lookupFallback`, or read it from the player's explicit `.rc <n> <v>`.
   * For d20 with no explicit DC and no lookup, defaults to 0 (rule fills DC).
   */
  target: number;
  /**
   * Explicit target value typed by the player (`.rc <name> <X>`).
   * Set only when the player supplied it; unset when the engine looked it up.
   * COC modules ignore this; d20 uses it as DC (defaulting to 10 when absent).
   */
  explicitTarget?: number;
  /**
   * Value returned by `room_skills` row OR `rule.lookupFallback`.
   * COC uses this as the threshold; d20 ignores (modifier comes from
   * the player-supplied formula instead).
   */
  storedValue?: number;
  /**
   * Pre-evaluated modifier from the player's `.rc <name>+<formula>` expression.
   * The engine rolls any embedded dice (e.g. `+1+1d6`) via
   * `parseAndRollExpression` before calling the rule; the rule just sums.
   * COC ignores; d20 adds to the d20 roll.
   */
  modifierValue?: number;
  /**
   * Human-readable rendering of the modifier expression, including individual
   * die rolls when the formula contained dice. E.g. `"+1+1d6([3])=+4"`.
   * Rules persist this in the check `detail` for chat-bubble display.
   */
  modifierDisplay?: string;
  /**
   * Structured breakdown of the evaluated modifier expression, one entry per
   * term with per-die results. Set alongside `modifierValue` whenever the
   * player's formula was evaluated. Rules that show individual die faces in
   * the check bubble build their display from this.
   */
  modifierTerms?: ReadonlyArray<ModifierTerm>;
  /** Character sheet of the rolling user (always loaded by the engine now). */
  sheet: CharacterData | null;
}

export interface CheckResult {
  /** Final display name shown to players (canonicalized, e.g. `san → 理智值`). */
  skillName: string;
  /** Human dice notation, e.g. `1d100`, `1d20+3`. */
  notation: string;
  /** Raw die rolls, in roll order. */
  rolls: number[];
  /** Final compared value (raw roll for COC; roll+mods for d20). */
  total: number;
  /** The threshold/DC compared against. */
  target: number;
  /** Whether the roll counts as a pass for the rule. */
  passed: boolean;
  /** Visual grade for the bubble (engine maps to icon + label). */
  grade: VisualGrade;
  /**
   * Body of `messages.diceDetail`. The engine adds `command` and proxy
   * attribution before persisting — rules must NOT include those fields here.
   * Shape must remain compatible with the chat renderer.
   */
  detail: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// `.st` stat-name routing
// ---------------------------------------------------------------------------

export type StatRoute =
  | { kind: "skill"; canonical: string }
  | { kind: "attribute"; key: string; canonical: string }
  | { kind: "resource"; key: string; canonical: string };

// ---------------------------------------------------------------------------
// Capabilities (drives UI / host actions / AI gates without rule-id branching)
// ---------------------------------------------------------------------------

export type CheckMenuMode = "check" | "psychology" | "sancheck";

export interface ResourceBarSpec {
  /** Logical key the sheet stores under (`hp`, `san`, `mp`, …). */
  key: string;
  /** i18n key under `messages.character` for the bar label. */
  labelKey: string;
  /**
   * Render style. `"bar"` (default) is a current/max pair with a fill bar.
   * `"counter"` is an unbounded counter (value + steppers, no max) for
   * accumulating resources like Triangle Agency's commendations/reprimands.
   */
  style?: "bar" | "counter";
}

export interface AttributeKeySpec {
  /** Logical key in `cocAttributes` (or future rule's attribute bag). */
  key: string;
  /** i18n key under `messages.character` for the label. */
  labelKey: string;
}

export interface RuleCapabilities {
  /** Renders SAN bar; enables `.sc` and host `requestSanCheckAction`. */
  hasSanity: boolean;
  /** Enables host `psychologyHiddenRollAction` and its TopBar menu item. */
  hasPsychologyRoll: boolean;
  /** Renders MP bar in character sheet + tooltip. */
  hasManaPoints: boolean;
  /** Modes shown in the TopBar 检定 dropdown for the host. */
  checkMenuModes: ReadonlyArray<CheckMenuMode>;
  /** Whitelist of chat commands the rule honors (`help`, `st`, `rc`, `ra`, `rh`, `rd`, `r`, `sc`). */
  supportedCommands: ReadonlyArray<string>;
  /** Predefined resource bars rendered in the character sheet. */
  resourceBars: ReadonlyArray<ResourceBarSpec>;
  /** Predefined attribute grid rendered in the character sheet. */
  attributeKeys: ReadonlyArray<AttributeKeySpec>;
  /**
   * `.rd`/`.r` default dice expression when player supplies no args.
   * COC/basic: `"1d100"`; DnD 5e: `"1d20"`.
   */
  defaultRollExpression: string;
  /**
   * When true (COC/basic), engine errors with STAT_NOT_SET on `.rc <name>`
   * if neither `room_skills` nor `lookupFallback` yields a value.
   * When false (d20), engine proceeds with `target=0`/`storedValue=undefined`
   * and lets the rule decide a default (d20 uses DC=10).
   */
  requiresStoredTarget: boolean;
  /**
   * When true, the character panel exposes free-text `role` and numeric
   * `level` fields above the attribute grid. d20 sets true; COC/basic false.
   */
  hasRoleLevel: boolean;
  /**
   * Quick-insert command chips rendered above the chat input, in order.
   * Each entry is a full command string (e.g. `".rd100"`, `".r 6d4"`).
   */
  quickRolls: ReadonlyArray<string>;
  /**
   * Die face to visually highlight in plain-roll results (Triangle Agency
   * highlights every 3). Stamped into the dice detail JSON at roll time so
   * the chat renderer stays rule-agnostic and history self-describes.
   */
  highlightDieFace?: number;
  /**
   * Optional host-check-request specialization (pure data). When present:
   *  - the host dialog swaps the diceType selector for the declared fields
   *    (optional DC + style-dice stepper) and makes the check name optional;
   *  - the request detail carries `{ dc, styleDice }`;
   *  - responding players are prompted for a bonus-dice count before rolling
   *    (the server synthesizes the rule's `.rc name+x±y DC` command).
   * Absent (all other rules): the legacy skill-name + diceType flow.
   */
  checkRequestOptions?: {
    /** Host dialog shows an optional DC input (blank → rule default DC). */
    dcField: boolean;
    /** Host dialog shows a style-dice (时髦骰) input within min..max, default 0. */
    styleDiceField?: { min: number; max: number };
    /** Check name may be left blank (server falls back to a generic label). */
    skillNameOptional: boolean;
    /** Responder must supply a bonus-dice count (加骰 x), 0..max. */
    responderBonusDice?: { max: number };
  };
}

// ---------------------------------------------------------------------------
// AI helper payload
// ---------------------------------------------------------------------------

export interface AiRuleHints {
  /** Single-paragraph rule explanation injected into the bot's system prompt. */
  rulesPrompt: string;
  /**
   * Additional JSON-schema fragment merged into the `update_character_sheet`
   * tool's `properties`. Lets each rule advertise its own sheet structure
   * to the LLM. May be empty for rules without a structured sheet.
   */
  sheetToolSchemaFields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

export interface RuleModule {
  /** Stable id persisted in `rooms.rule_template`. */
  readonly id: string;
  /** i18n key under `messages.rooms` for the dropdown label. */
  readonly labelKey: string;
  /** Optional i18n key for the dropdown hint line. */
  readonly hintKey?: string;
  /**
   * i18n key under `messages.commands` for the usage error emitted when
   * `parseRcArgs` returns null. Defaults to `"rcUsageError"`. Rules that
   * don't support `.rc` at all point this at an explanatory message.
   */
  readonly rcUsageKey?: string;
  /** Feature gates — see `RuleCapabilities`. */
  readonly capabilities: RuleCapabilities;

  // ----- Character sheet ----------------------------------------------------

  /** Fresh sheet for a new player in this rule's rooms. */
  initCharacter(): CharacterData;
  /**
   * Recompute derived fields after attribute edits.
   * Must preserve player-set current resource values where possible
   * (COC re-clamps `hp_current` / `san_current` / `mp_current` to new maxes).
   */
  computeDerived(sheet: CharacterData): CharacterData;

  // ----- Stat resolution ----------------------------------------------------

  /** Decide whether a `.st` name lands in room_skills, an attribute, or a resource. */
  routeStat(name: string): StatRoute;
  /** Display-name normalization (`san → 理智值`). Rules without aliases return input as-is. */
  canonicalStatName(name: string): string;
  /**
   * Fallback target lookup when `.rc <name>` doesn't match a row in
   * room_skills. COC consults the character sheet (attribute or current
   * resource value); basic d100 returns null.
   */
  lookupFallback(name: string, sheet: CharacterData | null): { name: string; value: number } | null;

  // ----- Check resolution ---------------------------------------------------

  /** Roll, compare, grade — the rule fully owns the dice mechanic. */
  resolveCheck(req: CheckRequest): CheckResult;

  // ----- `.rc` argument parsing --------------------------------------------

  /**
   * Parse a `.rc <args>` argument string into a normalized shape.
   * Returning `null` signals a usage error (engine emits the rule's usage
   * message). Each rule owns its own syntax:
   *   - COC/basic: `<name>[\s*<integer>]` (trailing number is threshold;
   *     space is optional, matching legacy behavior).
   *   - d20: `<name>[<+/-mod-formula>][\s+<DC>]` (modifier expression may
   *     embed dice; the space before DC is required).
   */
  parseRcArgs(args: string): null | {
    skillName: string;
    explicitTarget?: number;
    /** Modifier formula string the engine must evaluate (e.g. `"+1+1d6"`). */
    modifierExpression?: string;
  };

  /**
   * Optional: claim a `.r <args>` invocation as a shorthand check. Called by
   * the dice-roll handler BEFORE generic expression parsing (only when args
   * are non-empty and the roll is not hidden). Returning a parsed shape (same
   * contract as `parseRcArgs`; `skillName` may be empty for a nameless check)
   * routes the command through the full check flow; returning `null` falls
   * through to the normal dice roll. 狩魂者 uses this for `.r+x±y [DC]`.
   */
  parseQuickCheckArgs?(args: string): null | {
    skillName: string;
    explicitTarget?: number;
    modifierExpression?: string;
  };

  // ----- `.st` attribute/resource write -----------------------------------

  /**
   * Apply a `.st` write to the sheet for an attribute or resource route.
   * Returns the mutated sheet (rules may also return the same reference)
   * and the final stored value (resources are clamped to their maxes).
   * Rules WITHOUT structured sheets (basic) return the input unchanged.
   *
   * The engine never inspects the sheet for rule-specific keys — this
   * method is the single dispatch point. COC's implementation hosts the
   * attribute/resource branches that used to live inline in the engine.
   */
  applyStatWrite(
    sheet: CharacterData,
    route: Extract<StatRoute, { kind: "attribute" } | { kind: "resource" }>,
    value: number,
  ): { sheet: CharacterData; finalValue: number };

  // ----- Export / AI integration -------------------------------------------

  /** Fields injected into the player snapshot inside character exports. */
  exportSnapshot(sheet: CharacterData): Record<string, unknown>;
  /** Rule-flavored prompt + tool schema fragment for the AI agent. */
  describeForAI(): AiRuleHints;
}
