/**
 * Triangle Agency rule module.
 *
 * v1 design — intentionally minimal:
 *  - Rolls are plain `6d4` pools; every die showing **3** is a success. The
 *    engine stamps `highlightFace: 3` into plain-roll dice details so the
 *    chat renderer accents the 3s — counting/grading stays with the players.
 *  - 9 free-set Qualifications as attributes (bookkeeping values, e.g.
 *    Quality Assurance counts — they never modify a roll).
 *  - Commendations / Reprimands as unbounded counters (style: "counter" —
 *    no max, no clamp; GM awards them during play).
 *  - NO `.rc` checks in v1: `parseRcArgs` always returns null and the
 *    TopBar check menu is hidden (`checkMenuModes: []`). `resolveCheck`
 *    throwing guards against future wiring mistakes.
 */

import { TA_DEFAULT_QUALITIES } from "./sheet";
import { resolveTaStat } from "./stats";
import { legacyAttributes, legacyBase, legacyCurrent, setResource } from "@/lib/character/legacy";
import type {
  AiRuleHints,
  RuleCapabilities,
  RuleModule,
  StatRoute,
} from "../types";

// 9 qualification cards rendered in the character panel grid, in order.
const TA_ATTRIBUTE_KEYS: ReadonlyArray<{ key: string; labelKey: string }> = [
  { key: "attentiveness", labelKey: "attentiveness" },
  { key: "duplicity", labelKey: "duplicity" },
  { key: "dynamism", labelKey: "dynamism" },
  { key: "empathy", labelKey: "empathy" },
  { key: "initiative", labelKey: "initiative" },
  { key: "persistence", labelKey: "persistence" },
  { key: "presence", labelKey: "presence" },
  { key: "professionalism", labelKey: "professionalism" },
  { key: "subtlety", labelKey: "subtlety" },
];

const TA_RESOURCE_BARS: ReadonlyArray<{ key: string; labelKey: string; style: "counter" }> = [
  { key: "commendations", labelKey: "commendations", style: "counter" },
  { key: "reprimands", labelKey: "reprimands", style: "counter" },
];

const capabilities: RuleCapabilities = {
  hostLabelKey: "manager",
  playerLabelKey: "agent",
  hasSanity: false,
  hasPsychologyRoll: false,
  // No check menu at all — v1 has no `.rc`; rolls are plain `.r 6d4`.
  checkMenuModes: [],
  supportedCommands: ["help", "st", "rh", "rd", "r"],
  helpEntryIds: ["st", "taR", "rdr", "rh", "help"],
  defaultRollExpression: "6d4",
  requiresStoredTarget: false,
  quickRolls: [".r 6d4"],
  highlightDieFace: 3,
};

export const triangleRule: RuleModule = {
  id: "triangle",
  labelKey: "ruleTemplateTriangle",
  hintKey: "ruleTemplateTriangleHint",
  rcUsageKey: "taRcNotSupported",
  capabilities,
  sheet: {
    attributes: TA_ATTRIBUTE_KEYS.map(({ key, labelKey }) => ({
      key, labelKey, min: 0, max: 99, default: 0, required: false,
    })),
    resources: TA_RESOURCE_BARS.map(({ key, labelKey }) => ({
      key, labelKey, style: "counter" as const, initial: 0, cap: 999, required: false,
    })),
    derived: [],
    profile: { roleLevel: false },
    customAttributes: {},
  },

  derive() {
    return {};
  },

  migrateLegacy(legacy) {
    const out = legacyBase(legacy, "triangle");
    out.attributes = legacyAttributes(legacy.taQualities, { ...TA_DEFAULT_QUALITIES });
    setResource(out, "commendations", { current: legacyCurrent(legacy.taSheet?.commendations, 0) });
    setResource(out, "reprimands", { current: legacyCurrent(legacy.taSheet?.reprimands, 0) });
    return out;
  },


  routeStat(name: string): StatRoute {
    const r = resolveTaStat(name);
    if (r.kind === "attribute") return { kind: "attribute", key: r.key, canonical: r.canonical };
    if (r.kind === "resource") return { kind: "resource", key: r.key, canonical: r.canonical };
    return { kind: "skill", canonical: r.canonical };
  },

  canonicalStatName(name: string): string {
    const r = resolveTaStat(name);
    return r.kind === "skill" ? name : r.canonical;
  },

  lookupFallback(): { name: string; value: number } | null {
    return null;
  },

  // `.rc` is not part of v1 — always a usage error (rcUsageKey explains).
  parseRcArgs() {
    return null;
  },

  resolveCheck(): never {
    // Unreachable: parseRcArgs never succeeds and the check menu is hidden.
    throw new Error("triangle rule does not support skill checks");
  },

  describeForAI(): AiRuleHints {
    return {
      rulesPrompt:
        "Room Dice Rules: Triangle Agency " +
        "(all task rolls are `.r 6d4`; every die showing 3 is one success — " +
        "usually 1 success completes the task, 3+ successes is exceptional, 0 successes means trouble. " +
        "Qualification values on the sheet are bookkeeping only and never modify rolls. " +
        "Commendations (嘉奖) and Reprimands (处分) are unbounded counters the GM awards; " +
        "set them with `.st 嘉奖 <n>` / `.st 处分 <n>`. There is no `.rc` check in this room).",
    };
  },
};
