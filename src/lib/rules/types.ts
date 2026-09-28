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
 *    this vocabulary in lockstep with the chat's dice rendering
 *    (`components/room/chat/message/dice/`).
 */

import type { CharacterData } from "@/lib/character/types";
import type { CharacterSheetV2 } from "@/lib/character/sheet-v2";
import type { LegacySheet } from "@/lib/character/legacy";
import type { DerivedValues, SheetSchema } from "./sheet-schema";

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
  /**
   * Opaque rule-owned payload produced by the same rule's `parseRcArgs` /
   * `parseQuickCheckArgs` and forwarded verbatim by the engine. Lets a rule
   * carry syntax extras the generic parsed shape has no slot for (COC's
   * bonus/penalty dice count) without the engine learning the field. Rules
   * must treat it as untrusted (it round-trips through their own parser, but
   * defensive clamping keeps `resolveCheck` total).
   */
  ruleData?: Record<string, unknown>;
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

export interface RuleCapabilities {
  /**
   * i18n key under `messages.hostLabels` for what this system calls the person
   * running the game — COC 7th says "KP", DnD 5e says "DM", Triangle Agency
   * says 经理/Manager, everything else falls back to the generic 主持人/GM.
   * Every room-scoped surface that names the host (chat badges, member list,
   * visibility labels, inventory source/visibility, timeline, room info,
   * lobby room cards) reads this instead of hardcoding a title.
   */
  hostLabelKey: string;
  /**
   * i18n key under `messages.playerLabels` for what this system calls the
   * people playing — COC 7th says 调查员/Investigator, DnD 5e says 冒险者/
   * Adventurer, Triangle Agency says 特工/Agent, 狩魂者 says 狩魂者/Soul
   * Hunter, everything else falls back to the generic 玩家/Player.
   * Room-scoped surfaces that name the player role (member list role tag,
   * host check dialog, inventory distribution modals, lobby member count)
   * read this instead of hardcoding a title.
   */
  playerLabelKey: string;
  /** Renders SAN bar; enables `.sc` and host `requestSanCheckAction`. */
  hasSanity: boolean;
  /** Enables host `psychologyHiddenRollAction` and its TopBar menu item. */
  hasPsychologyRoll: boolean;
  /** Modes shown in the TopBar 检定 dropdown for the host. */
  checkMenuModes: ReadonlyArray<CheckMenuMode>;
  /** Whitelist of chat commands the rule honors (`help`, `st`, `rc`, `ra`, `rh`, `rd`, `r`, `sc`). */
  supportedCommands: ReadonlyArray<string>;
  /**
   * Ordered rows of the `.help` card. Each id keys into the
   * `commands.helpEntries` i18n map ({cmd, desc} objects), so every room
   * documents exactly the commands — and the syntax — its rule honors
   * (d20 `.rc` vs d100 `.rc`, 狩魂者's `.r+x±y` shorthand, Triangle's
   * "count the 3s" guidance). Keep in lockstep with `supportedCommands`.
   */
  helpEntryIds: ReadonlyArray<string>;
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
   *  - responding players are prompted for a bonus-dice count before rolling;
   *    the server builds the command with the rule's `buildCheckCommand`
   *    (name, bonusDice, styleDice, dc), so a rule declaring this must
   *    implement it — without it every response fails.
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
  /**
   * Player-side quick-check panel (the ◎ button left of the chat input) —
   * pure data describing which pickers and fields the panel renders for this
   * rule. Absent ⇒ no entry button at all (triangle has no `.rc`).
   *
   * The panel never rolls: it builds a command string via the rule's
   * `buildCheckCommand` and submits it exactly like typed chat input, so the
   * one server-side check flow stays the single resolver. Declaring this
   * capability and implementing `buildCheckCommand` are two halves of the
   * same contract (mirroring `checkRequestOptions` ↔ host dialog);
   * `rules.test.ts` asserts the pairing.
   */
  quickCheckPanel?: QuickCheckPanelSpec;
}

/** See `RuleCapabilities.quickCheckPanel`. */
export interface QuickCheckPanelSpec {
  /** List the player's own `room_skills` rows as pickable entries. */
  skills: boolean;
  /**
   * List the schema's attributes (`sheet.attributes`, values via `resolveSheet`) as
   * pickable entries. Only meaningful for rules whose `.rc` can resolve an
   * attribute by name (COC's `lookupFallback`); d20 leaves it false because
   * ability *scores* are not modifiers.
   */
  attributes: boolean;
  /**
   * Checkable resource currents (COC's 理智值), keyed into `sheet.resources`.
   * Values come from `resolveSheet(...).resources`.
   */
  resourceKeys?: ReadonlyArray<string>;
  /**
   * How the check name is supplied: `"select"` — picked from the lists above;
   * `"optionalText"` — free text that may stay empty (狩魂者's nameless
   * `.r+x±y` shorthand).
   */
  nameField: "select" | "optionalText";
  /** Free DC input (blank → rule default; d20/狩魂者). */
  dcField?: boolean;
  /**
   * Flat modifier stepper (d20 加值). Selecting a stored skill seeds it with
   * that skill's stored value — the roll20-style "my stored number IS my
   * bonus" flow.
   */
  modifierField?: boolean;
  /**
   * COC bonus/penalty dice segmented control, rendered as −max..+max
   * (positive = 奖励骰, negative = 惩罚骰).
   */
  bonusPenaltyDice?: { max: number };
  /**
   * d20 advantage/disadvantage 3-state control (劣势 / 无 / 优势). DnD 5e
   * never stacks them, so this is a single toggle — never a counter.
   */
  advantageField?: boolean;
  /** 狩魂者 加骰 (d4 count) stepper, 0..max. */
  bonusDiceField?: { max: number };
  /** 狩魂者 时髦骰 (d6 count) stepper, min..max (negatives subtract). */
  styleDiceField?: { min: number; max: number };
  /** Show the 暗骰 toggle (command swaps to the hidden `.rch` variant). */
  hiddenToggle: boolean;
}

/**
 * Panel state handed to `buildCheckCommand`. Fields mirror
 * `QuickCheckPanelSpec` — the panel only populates what the spec declared,
 * and the rule ignores anything it didn't ask for.
 */
export interface QuickCheckInput {
  /** Selected/typed stat name; `""` for a nameless 狩魂者 check. */
  name: string;
  /**
   * Stored value of the selected entry (skill value / attribute / resource
   * current), when one was selected. Preview-only — commands omit it so the
   * server re-resolves the live value.
   */
  value?: number;
  /** Typed DC (`dcField`). */
  dc?: number;
  /** Flat modifier (`modifierField`). */
  modifier?: number;
  /** Bonus(+)/penalty(−) dice count (`bonusPenaltyDice`). */
  bonusPenalty?: number;
  /** d20 advantage state (`advantageField`): 1 = 优势, −1 = 劣势, 0/absent = none. */
  advantage?: number;
  /** 加骰 count (`bonusDiceField`). */
  bonusDice?: number;
  /** 时髦骰 count (`styleDiceField`), may be negative. */
  styleDice?: number;
  /** 暗骰 toggle state (`hiddenToggle`). */
  hidden: boolean;
}

// ---------------------------------------------------------------------------
// AI helper payload
// ---------------------------------------------------------------------------

export interface AiRuleHints {
  /** Single-paragraph rule explanation injected into the bot's system prompt. */
  rulesPrompt: string;
}

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

export interface RuleModule {
  /** Stable id persisted in `rooms.rule_template`. */
  readonly id: string;
  /**
   * i18n key for the rule's display name. Defined under the `createRoom`,
   * `roomSettings`, and `export` namespaces (there is no `rooms` namespace);
   * resolve it against whichever of those the call site already uses.
   */
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

  /**
   * Declarative sheet: attributes, resources, derived values and standard
   * skills. The generic functions in `src/lib/character/` read, edit, clamp
   * and grade completion from this — see `sheet-schema.ts`.
   */
  readonly sheet: SheetSchema;
  /**
   * Pure: attribute values (defaults filled in) → derived values, including
   * the hidden ones resource maxes and initial values point at. Rules
   * without derivations return `{}`.
   */
  derive(attributes: Readonly<Record<string, number>>): DerivedValues;
  /**
   * Upgrade a pre-v2 sheet built for this rule to the v2 shape. Only the
   * compatibility reader and the backfill script call it.
   */
  migrateLegacy(legacy: LegacySheet): CharacterSheetV2;

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
  /**
   * Optional: alternate spellings of `name` also worth trying against
   * room_skills before falling back to `lookupFallback` (COC's 侦查/侦察).
   * The engine tries the typed name first, then each returned candidate in
   * order, via the same exact-match query. Rules without skill aliases omit
   * this method entirely — the engine treats a missing method as "no
   * aliases", so behavior is unchanged for every other rule.
   */
  skillAliasCandidates?(name: string): string[];

  // ----- Check resolution ---------------------------------------------------

  /** Roll, compare, grade — the rule fully owns the dice mechanic. */
  resolveCheck(req: CheckRequest): CheckResult;

  /**
   * Optional: how the rule reads a *plain* dice roll (`.rd`/`.r`, not a check).
   * Lets the AI agent react idiomatically to a raw result — COC recognizes
   * 01–05 / 96–100 on a single 1d100; basic adds a "CoC-cultural" hint. Returns
   * a short human-readable evaluation string, or `null` when the roll carries
   * no special meaning for this system. Rules that omit it read every roll as
   * plain. This is where the crit/fumble knowledge lives, so the engine and AI
   * never branch on the rule id.
   */
  naturalGrade?(roll: number, faces: number, count: number): string | null;

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
    /** Rule-owned extras forwarded into `CheckRequest.ruleData` untouched. */
    ruleData?: Record<string, unknown>;
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
    /** Rule-owned extras forwarded into `CheckRequest.ruleData` untouched. */
    ruleData?: Record<string, unknown>;
  };

  /**
   * Optional: claim a `.rd/.r/.rh <args>` invocation as a rule-special PLAIN
   * roll (no target, no pass/fail) with mechanics the generic expression
   * parser cannot express — COC's `.rd100b2` / `.rd100p1` bonus/penalty roll,
   * where extra tens dice replace the original d100's tens digit. Called
   * FIRST in the dice-roll handler (before the numeric-prefix rewrite and
   * generic parsing), for hidden rolls too (`.rh100b2` is a legit 暗投).
   * Returning `null` falls through to the normal dice pipeline.
   *
   * The rule rolls its own dice (like `resolveCheck`) and returns the pieces
   * the engine needs to emit the message: dice notation, a human-readable
   * inline display, the final value, and the diceDetail body (the engine adds
   * `command` + proxy attribution before persisting).
   */
  resolvePlainRoll?(args: string): null | {
    /** Dice notation, e.g. `"1d100b2"`. */
    notation: string;
    /** Inline text for the chat content line, e.g. `"65 → 25"`. */
    display: string;
    /** Final value after the rule's mechanic. */
    total: number;
    /** diceDetail JSON body — must NOT include `command` (engine adds it). */
    detail: Record<string, unknown>;
  };

  /**
   * Optional: turn the quick-check panel's state into the exact chat command
   * a player could have typed (plus a human-readable dice preview for the
   * roll button, e.g. `1d100 ≤ 60`). Present iff
   * `capabilities.quickCheckPanel` is declared — the two are one contract.
   * Also required by `capabilities.checkRequestOptions`: the server builds
   * host-check responses with it (`respondToCheckRequestAction`).
   *
   * Returns `null` for combinations the rule's syntax cannot express (狩魂者
   * nameless + hidden); the panel disables its roll button then. Must be
   * pure and client-safe (no server imports) — the panel runs it on every
   * keystroke to keep the preview live.
   */
  buildCheckCommand?(input: QuickCheckInput): { command: string; preview: string } | null;

  // ----- Export / AI integration -------------------------------------------

  /** Rule-flavored prompt for the AI agent (sheet fields come from `sheet`). */
  describeForAI(): AiRuleHints;
}
