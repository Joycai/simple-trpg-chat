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

export interface CheckRequest {
  /** Display name to show in the check bubble (already canonicalized). */
  skillName: string;
  /**
   * Numeric target. Semantics depend on the rule:
   *  - COC d100: skill threshold (lower roll = success).
   *  - DnD 5e d20 (future): DC (higher roll = success).
   * The engine has already resolved this from room_skills or the rule's
   * `lookupFallback`, or read it from the player's explicit `.rc <n> <v>`.
   */
  target: number;
  /** Character sheet of the rolling user (already loaded, may be null). */
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

  // ----- Export / AI integration -------------------------------------------

  /** Fields injected into the player snapshot inside character exports. */
  exportSnapshot(sheet: CharacterData): Record<string, unknown>;
  /** Rule-flavored prompt + tool schema fragment for the AI agent. */
  describeForAI(): AiRuleHints;
}
