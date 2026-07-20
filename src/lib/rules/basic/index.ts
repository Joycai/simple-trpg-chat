/**
 * Basic d100 rule module.
 *
 * Behavior is byte-for-byte the same as the non-COC branch of the legacy
 * command engine: a `.rc` rolls 1d100, succeeds when `roll ≤ target`, and
 * carries no crit/fumble grading. The character sheet has no rule-specific
 * structure; `.st` always writes to room_skills.
 *
 * This module is the "do-nothing" baseline — most capability flags are off,
 * and most methods are identity / null. It exists so the engine has a real
 * `RuleModule` to delegate to and never has to special-case "no rule".
 */

import { rollDie } from "@/lib/utils";
import type { CharacterData } from "@/lib/character-types";
import type {
  AiRuleHints,
  CharacterStatus,
  CheckRequest,
  CheckResult,
  RuleCapabilities,
  RuleModule,
  StatRoute,
} from "../types";

const capabilities: RuleCapabilities = {
  hostLabelKey: "gm",
  playerLabelKey: "player",
  hasSanity: false,
  hasPsychologyRoll: false,
  hasManaPoints: false,
  checkMenuModes: ["check"],
  // Same command surface as today minus `.sc` (which is gated to COC).
  supportedCommands: ["help", "st", "rc", "ra", "rh", "rd", "r"],
  resourceBars: [],
  attributeKeys: [],
  defaultRollExpression: "1d100",
  requiresStoredTarget: true,
  hasRoleLevel: false,
  quickRolls: [".rc 侦查", ".rd100"],
};

export const basicRule: RuleModule = {
  id: "basic",
  labelKey: "ruleTemplateBasic",
  hintKey: undefined,
  capabilities,

  initCharacter(): CharacterData {
    return { ruleTemplate: "basic" };
  },

  // No derived state — basic sheets are free-form.
  computeDerived(sheet: CharacterData): CharacterData {
    return sheet;
  },

  // No preset resources: a basic sheet's numbers are all customAttributes,
  // which read-only surfaces render generically.
  readStatus(): CharacterStatus {
    return { resources: {} };
  },

  routeStat(name: string): StatRoute {
    return { kind: "skill", canonical: name.trim() };
  },

  canonicalStatName(name: string): string {
    return name;
  },

  // No character-sheet fallback: `.rc <name>` either matches a room_skills
  // row or returns STAT_NOT_SET upstream.
  lookupFallback(): { name: string; value: number } | null {
    return null;
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const { skillName, target } = req;
    const roll = rollDie(100);
    const passed = roll <= target;
    const grade = passed ? "success" : "failure";

    return {
      skillName,
      notation: "1d100",
      rolls: [roll],
      total: roll,
      target,
      passed,
      grade,
      // Shape preserved from the legacy `performSkillCheck` so chat renderers
      // and existing diceDetail consumers see no change. `command` and proxy
      // attribution are added by the engine before persisting.
      detail: {
        dice: "d100",
        count: 1,
        results: [roll],
        sum: roll,
        notation: "1d100",
        check: { skillName, target, roll, success: passed, grade },
      },
    };
  },

  /**
   * Replicates the legacy engine regex `/^(.+?)\s*([0-9]+)$/` byte-for-byte:
   * trailing integer is the target, with optional whitespace separator. Used
   * by both basic and COC for COC-compat command parsing.
   */
  parseRcArgs(args) {
    const trimmed = args.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^(.+?)\s*([0-9]+)$/);
    if (m) {
      let skillName = m[1].trim();
      const value = parseInt(m[2], 10);
      if (skillName.length > 50) skillName = skillName.slice(0, 50);
      if (!skillName || value < 0 || value > 999) return null;
      return { skillName, explicitTarget: value };
    }
    return { skillName: trimmed.length > 50 ? trimmed.slice(0, 50) : trimmed };
  },

  // Basic has no structured sheet — `.st` writes never reach attribute/
  // resource branches in practice (routeStat always returns "skill"). If a
  // future call site reaches here, return the input unchanged.
  applyStatWrite(sheet, _route, value) {
    return { sheet, finalValue: value };
  },

  exportSnapshot(): Record<string, unknown> {
    return {};
  },

  describeForAI(): AiRuleHints {
    return {
      // Verbatim from the legacy ai_agent.ts `rulesExplanation` else-branch.
      rulesPrompt:
        "Room Dice Rules: Basic (No special success/failure grading for raw dice rolls). " +
        "Note that in CoC/TRPG culture, rolling 100 on d100 is culturally considered a Fumble (大失败), " +
        "and 1 is a Critical Success (大成功). Please react appropriately to dice roll results.",
      sheetToolSchemaFields: {},
    };
  },
};
