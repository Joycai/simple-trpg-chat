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
  /** Renders MP bar in character sheet + tooltip. */
  hasManaPoints: boolean;
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
  /** Predefined resource bars rendered in the character sheet. */
  resourceBars: ReadonlyArray<ResourceBarSpec>;
  /** Predefined attribute grid rendered in the character sheet. */
  attributeKeys: ReadonlyArray<AttributeKeySpec>;
  /**
   * Read-only derived stats rendered after the attribute grid (狩魂者 shows
   * 术法强度 = ⌊智慧/2⌋). Pure display metadata — the values themselves are
   * computed by the sheet UI from the rule's derive helper, never persisted.
   */
  derivedStats?: ReadonlyArray<AttributeKeySpec>;
  /**
   * Attributes compact enough to also show in the chat avatar hover card
   * (狩魂者 shows its 3 base attributes; COC shows only 幸运). Keys match
   * `attributeKeys`, but the label may differ — the hover card is tight, so
   * a rule can point at a shorter i18n key than the sheet grid uses. Omit to
   * keep the hover card to resources and derived stats only.
   */
  statusAttributeKeys?: ReadonlyArray<AttributeKeySpec>;
  /**
   * How many player-defined `customAttributes` compact status surfaces (the
   * chat avatar hover card) may show. Rules with their own preset resources
   * leave this undefined and show all of them; `basic` has no presets at all,
   * so its status card is *only* custom attributes and caps at the first 2 to
   * stay a glance rather than a second character sheet.
   */
  statusCustomLimit?: number;
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
   * When true, the character panel lets players edit a resource bar's MAX
   * inline. d20 HP has no auto-derivation, so its max is free-set; rules with
   * derived maxes (COC / 狩魂者) leave this false — their max moves with the
   * attributes. Absent ⇒ false.
   */
  resourceMaxEditable?: boolean;
  /**
   * When true, the character panel persists resource *current* values through
   * `updateResourcesAction` (which targets a specific member, so a host can
   * adjust another player's bars) rather than bundling them into the player's
   * own sheet save. COC / 狩魂者 store currents in a derived/separate bag and set
   * this; d20 (HP inline on d20Sheet) and Triangle (counters on taSheet) leave
   * it false and save currents as part of their own sheet. Absent ⇒ false.
   */
  resourceCurrentsViaAction?: boolean;
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
   * List `capabilities.attributeKeys` (values via `readAttributes`) as
   * pickable entries. Only meaningful for rules whose `.rc` can resolve an
   * attribute by name (COC's `lookupFallback`); d20 leaves it false because
   * ability *scores* are not modifiers.
   */
  attributes: boolean;
  /**
   * Checkable resource currents (COC's 理智值), keyed into `resourceBars`.
   * Values come from `readStatus().resources[key].current`.
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
  /** 加骰 count (`bonusDiceField`). */
  bonusDice?: number;
  /** 时髦骰 count (`styleDiceField`), may be negative. */
  styleDice?: number;
  /** 暗骰 toggle state (`hiddenToggle`). */
  hidden: boolean;
}

// ---------------------------------------------------------------------------
// Read-only sheet status (chat avatar hover card)
// ---------------------------------------------------------------------------

/**
 * Flattened, display-ready snapshot of a sheet's live numbers, keyed by the
 * capability keys the rule already declares (`resourceBars`, `derivedStats`,
 * `statusAttributeKeys`). Each rule owns the mapping because each stores its
 * numbers in a different bag (`cocDerived` / `d20Sheet` / `taSheet` / …), so
 * read-only surfaces can render any rule without branching on the rule id.
 */
export interface CharacterStatus {
  /**
   * Current value (and max, for `"bar"`-style resources) per `resourceBars`
   * key. A key the sheet has no data for is simply omitted — the renderer
   * skips that bar rather than showing a zero.
   */
  resources: Record<string, { current: number; max?: number }>;
  /** Value per `derivedStats` key. Computed on read, never persisted. */
  derived?: Record<string, number>;
  /** Value per `statusAttributeKeys` entry. */
  attributes?: Record<string, number>;
  /** Optional short badge rendered next to an attribute (狩魂者 E..SSS+ grade). */
  attributeGrades?: Record<string, string>;
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
// Batch resource edit (host/player resource panel)
// ---------------------------------------------------------------------------

/**
 * A batch resource edit from the character panel / host adjust dialog. This is
 * the union of every rule's resource fields; each rule's `applyResourcePatch`
 * consumes the keys it owns and ignores the rest. Keeping it a flat superset
 * lets the server action stay rule-agnostic — it forwards the whole patch and
 * lets the module decide where each number lands and how it clamps.
 */
export interface ResourcePatch {
  hp_current?: number;
  /** Editable max (d20 HP). Rules with derived maxes ignore it. */
  hpMax?: number;
  san_current?: number;
  mp_current?: number;
  mana_current?: number;
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

  /** Fresh sheet for a new player in this rule's rooms. */
  initCharacter(): CharacterData;
  /**
   * Recompute derived fields after attribute edits.
   * Must preserve player-set current resource values where possible
   * (COC re-clamps `hp_current` / `san_current` / `mp_current` to new maxes).
   */
  computeDerived(sheet: CharacterData): CharacterData;
  /**
   * Read the sheet's live numbers into the generic `CharacterStatus` shape
   * for read-only surfaces (the chat avatar hover card). Rules without a
   * structured sheet (basic) return `{ resources: {} }`.
   */
  readStatus(sheet: CharacterData): CharacterStatus;
  /**
   * Read the rule's attribute bag into a flat record keyed by
   * `capabilities.attributeKeys[*].key` — the shape the character panel's
   * generic attribute grid edits. Missing values fall back to the rule's
   * defaults; rules without structured attributes (basic) return `{}`. This is
   * the read half that lets the panel stop reaching into `cocAttributes` /
   * `d20Attributes` / … by name.
   */
  readAttributes(sheet: CharacterData): Record<string, number>;
  /**
   * Merge an edited attribute record (from the panel grid) back into the rule's
   * attribute bag, whitelisting to `attributeKeys` and returning a new sheet.
   * Rules without structured attributes (basic) return `sheet` unchanged.
   * Callers run `computeDerived` afterwards to refresh derived values.
   */
  writeAttributes(sheet: CharacterData, values: Record<string, number>): CharacterData;
  /**
   * Merge an untrusted sheet patch (the AI bot's `set_character_card` tool
   * arguments) into `sheet`, returning a new sheet.
   *
   * The keys a rule accepts here are exactly the ones it advertised in
   * `describeForAI().sheetToolSchemaFields` — declaring a field to the model
   * and then handling it are two halves of the same contract, so they live in
   * the same module. When the AI layer branched on the rule id instead, the
   * two rules added later advertised `taQualities` / `shAttributes` to the LLM
   * and had them silently dropped on write.
   *
   * The model is not trusted: implementations must whitelist keys and clamp
   * every number to a sane range. Rules without a structured sheet (basic)
   * return `sheet` unchanged. Callers still run `computeDerived` afterwards.
   */
  applySheetPatch(sheet: CharacterData, patch: Record<string, unknown>): CharacterData;

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
   * Optional: turn the quick-check panel's state into the exact chat command
   * a player could have typed (plus a human-readable dice preview for the
   * roll button, e.g. `1d100 ≤ 60`). Present iff
   * `capabilities.quickCheckPanel` is declared — the two are one contract.
   *
   * Returns `null` for combinations the rule's syntax cannot express (狩魂者
   * nameless + hidden); the panel disables its roll button then. Must be
   * pure and client-safe (no server imports) — the panel runs it on every
   * keystroke to keep the preview live.
   */
  buildCheckCommand?(input: QuickCheckInput): { command: string; preview: string } | null;

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

  /**
   * Apply a batch resource edit (the character panel's HP/SAN/MP/mana steppers,
   * or a host adjusting another player's bars) to the sheet, clamping every
   * field the rule owns to its max. This is the single dispatch point that used
   * to live as a `ruleTemplate === "…"` chain inside `updateResourcesAction`.
   * Rules without structured resources (basic) return `sheet` unchanged.
   */
  applyResourcePatch(sheet: CharacterData, patch: ResourcePatch): CharacterData;

  // ----- Export / AI integration -------------------------------------------

  /** Fields injected into the player snapshot inside character exports. */
  exportSnapshot(sheet: CharacterData): Record<string, unknown>;
  /** Rule-flavored prompt + tool schema fragment for the AI agent. */
  describeForAI(): AiRuleHints;
}
