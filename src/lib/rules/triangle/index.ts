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

import type { CharacterData, TaQualities, TaSheet } from "@/lib/character-types";
import { TA_DEFAULT_QUALITIES } from "@/lib/character-types";
import { resolveTaStat } from "@/lib/ta-stats";
import type {
  AiRuleHints,
  AttributeKeySpec,
  ResourceBarSpec,
  RuleCapabilities,
  RuleModule,
  StatRoute,
} from "../types";

// 9 qualification cards rendered in the character panel grid, in order.
const TA_ATTRIBUTE_KEYS: ReadonlyArray<AttributeKeySpec> = [
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

const TA_RESOURCE_BARS: ReadonlyArray<ResourceBarSpec> = [
  { key: "commendations", labelKey: "commendations", style: "counter" },
  { key: "reprimands", labelKey: "reprimands", style: "counter" },
];

const capabilities: RuleCapabilities = {
  hostLabelKey: "manager",
  playerLabelKey: "player",
  hasSanity: false,
  hasPsychologyRoll: false,
  hasManaPoints: false,
  // No check menu at all — v1 has no `.rc`; rolls are plain `.r 6d4`.
  checkMenuModes: [],
  supportedCommands: ["help", "st", "rh", "rd", "r"],
  resourceBars: TA_RESOURCE_BARS,
  attributeKeys: TA_ATTRIBUTE_KEYS,
  defaultRollExpression: "6d4",
  requiresStoredTarget: false,
  hasRoleLevel: false,
  quickRolls: [".r 6d4"],
  highlightDieFace: 3,
};

export const triangleRule: RuleModule = {
  id: "triangle",
  labelKey: "ruleTemplateTriangle",
  hintKey: "ruleTemplateTriangleHint",
  rcUsageKey: "taRcNotSupported",
  capabilities,

  initCharacter(): CharacterData {
    return {
      ruleTemplate: "triangle",
      taQualities: { ...TA_DEFAULT_QUALITIES },
      taSheet: { commendations: 0, reprimands: 0 },
    };
  },

  computeDerived(sheet: CharacterData): CharacterData {
    // Nothing derived — qualifications and counters are all free-set.
    return sheet;
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

  applyStatWrite(sheet, route, value) {
    const data = { ...sheet };

    if (route.kind === "attribute") {
      const key = route.key as keyof TaQualities;
      const qualities: TaQualities = { ...(data.taQualities ?? TA_DEFAULT_QUALITIES) };
      qualities[key] = value;
      data.taQualities = qualities;
      return { sheet: data, finalValue: value };
    }

    // resource — unbounded counters; floor at 0, never clamp to a max.
    const meta: TaSheet = { ...(data.taSheet ?? {}) };
    const stored = Math.max(0, value);
    meta[route.key as keyof TaSheet] = stored;
    data.taSheet = meta;
    return { sheet: data, finalValue: stored };
  },

  exportSnapshot(sheet: CharacterData): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (sheet.taSheet) {
      out.commendations = sheet.taSheet.commendations;
      out.reprimands = sheet.taSheet.reprimands;
    }
    if (sheet.taQualities) {
      out.qualities = sheet.taQualities;
    }
    return out;
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
      sheetToolSchemaFields: {
        taQualities: {
          type: "object",
          description:
            "Triangle Agency qualifications (only when ruleTemplate is 'triangle'). " +
            "9 free-set numeric keys: attentiveness(专注), duplicity(欺瞒), dynamism(活力), " +
            "empathy(共情), initiative(主动), persistence(坚持), presence(存在感), " +
            "professionalism(专业), subtlety(隐微).",
        },
        taSheet: {
          type: "object",
          description:
            "Triangle Agency counters (only when ruleTemplate is 'triangle'). " +
            "Fields: commendations (嘉奖, number ≥ 0), reprimands (处分, number ≥ 0). " +
            "Unbounded accumulating counters — no max.",
        },
      },
    };
  },
};
