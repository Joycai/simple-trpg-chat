/**
 * COC 7th rule module.
 *
 * Wraps the existing `coc-stats` resolver and `computeCocDerived` helper to
 * preserve byte-for-byte behavior of the legacy command engine. Three quirks
 * worth flagging for future readers:
 *
 *  1. `success` boolean in the `check` detail tracks `roll <= target`
 *     literally, even when a 01–05 critical occurs against a target < 5 (so
 *     `success=false, grade="critical"` is possible). This matches the
 *     pre-refactor behavior and is preserved deliberately.
 *  2. SAN max is always 99 (`COC_MAX_SANITY`), never tied to POW — older
 *     sheets that stored `sanMax = pow` get rewritten on the next compute.
 *  3. `computeDerived` re-clamps player-adjusted current resource values
 *     (hp_current / san_current / mp_current) to the new maxes after an
 *     attribute edit. The merge logic mirrors `syncCharacterStat` so the
 *     engine and the rule module agree on resource state.
 */

import { rollDie } from "@/lib/utils";
import {
  COC_DEFAULT_ATTRIBUTES,
  COC_MAX_SANITY,
  computeCocDerived,
  type CharacterData,
  type CocAttributes,
  type CocDerived,
} from "@/lib/character-types";
import { resolveCocStat } from "@/lib/coc-stats";
import type {
  AiRuleHints,
  AttributeKeySpec,
  CheckRequest,
  CheckResult,
  ResourceBarSpec,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "../types";

// Order + label keys come straight from AttributesTab.tsx's `cocAttrKeys`,
// so the panel renders the same grid when it switches to capability-driven
// rendering in Phase 3.
const COC_ATTRIBUTE_KEYS: ReadonlyArray<AttributeKeySpec> = [
  { key: "str", labelKey: "str" },
  { key: "dex", labelKey: "dex" },
  { key: "con", labelKey: "con" },
  { key: "int", labelKey: "int" },
  { key: "pow", labelKey: "pow" },
  { key: "edu", labelKey: "edu" },
  { key: "siz", labelKey: "siz" },
  { key: "app", labelKey: "app" },
  { key: "luck", labelKey: "luckAttr" },
];

const COC_RESOURCE_BARS: ReadonlyArray<ResourceBarSpec> = [
  { key: "hp", labelKey: "hp" },
  { key: "san", labelKey: "san" },
  { key: "mp", labelKey: "mp" },
];

const capabilities: RuleCapabilities = {
  hasSanity: true,
  hasPsychologyRoll: true,
  hasManaPoints: true,
  checkMenuModes: ["check", "psychology", "sancheck"],
  supportedCommands: ["help", "st", "rc", "ra", "rh", "rd", "r", "sc"],
  resourceBars: COC_RESOURCE_BARS,
  attributeKeys: COC_ATTRIBUTE_KEYS,
};

export const coc7thRule: RuleModule = {
  id: "coc7th",
  labelKey: "ruleTemplateCoc7th",
  hintKey: "ruleTemplateHint",
  capabilities,

  initCharacter(): CharacterData {
    const attrs = { ...COC_DEFAULT_ATTRIBUTES };
    return {
      ruleTemplate: "coc7th",
      cocAttributes: attrs,
      cocDerived: computeCocDerived(attrs),
    };
  },

  computeDerived(sheet: CharacterData): CharacterData {
    if (sheet.ruleTemplate !== "coc7th" || !sheet.cocAttributes) {
      return sheet;
    }
    const prev: Partial<CocDerived> = sheet.cocDerived || {};
    const recomputed = computeCocDerived(sheet.cocAttributes);

    // Preserve player-set current values, re-clamped to new maxes. This
    // mirrors `syncCharacterStat`'s attribute branch in lib/commands.ts.
    const clampOpt = (v: unknown, max: number) =>
      typeof v === "number" ? Math.min(Math.max(0, v), max) : undefined;
    const hpCur = clampOpt(prev.hp_current, recomputed.hpMax);
    const sanCur = clampOpt(prev.san_current ?? prev.san, recomputed.sanMax);
    const mpCur = clampOpt(prev.mp_current, recomputed.mpMax);
    if (hpCur !== undefined) recomputed.hp_current = hpCur;
    if (sanCur !== undefined) {
      recomputed.san_current = sanCur;
      recomputed.san = sanCur;
    }
    if (mpCur !== undefined) recomputed.mp_current = mpCur;

    return { ...sheet, cocDerived: recomputed };
  },

  routeStat(name: string): StatRoute {
    const r = resolveCocStat(name);
    if (r.kind === "attribute") return { kind: "attribute", key: r.key, canonical: r.canonical };
    if (r.kind === "resource") return { kind: "resource", key: r.key, canonical: r.canonical };
    return { kind: "skill", canonical: r.canonical };
  },

  canonicalStatName(name: string): string {
    const r = resolveCocStat(name);
    return r.kind === "skill" ? name : r.canonical;
  },

  lookupFallback(name, sheet) {
    if (!sheet) return null;
    const resolved = resolveCocStat(name);
    if (resolved.kind === "skill") return null;

    if (resolved.kind === "attribute") {
      const v = sheet.cocAttributes?.[resolved.key as keyof CocAttributes];
      if (typeof v === "number") return { name: resolved.canonical, value: v };
      return null;
    }

    // resource → current value (falls back to base field for legacy sheets)
    const d = sheet.cocDerived as (CocDerived & Record<string, number | undefined>) | undefined;
    const cur = d?.[`${resolved.key}_current`] ?? d?.[resolved.key];
    if (typeof cur === "number") return { name: resolved.canonical, value: cur };
    return null;
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const { skillName, target } = req;
    const roll = rollDie(100);
    const passed = roll <= target;
    // Quirk #1 preserved: success boolean stays as raw (roll <= target);
    // grade may upgrade/downgrade to critical/fumble independent of it.
    const baseGrade: VisualGrade = passed ? "success" : "failure";
    const grade: VisualGrade = roll <= 5 ? "critical" : roll >= 96 ? "fumble" : baseGrade;

    return {
      skillName,
      notation: "1d100",
      rolls: [roll],
      total: roll,
      target,
      passed,
      grade,
      // Shape preserved from legacy `performSkillCheck`.
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

  exportSnapshot(sheet: CharacterData): Record<string, unknown> {
    // Shape mirrors the legacy export.ts COC block.
    const out: Record<string, unknown> = {};
    if (sheet.cocDerived) {
      out.hp = sheet.cocDerived.hp;
      out.hpMax = sheet.cocDerived.hpMax;
      out.san = sheet.cocDerived.san;
      out.mp = sheet.cocDerived.mp;
    }
    if (sheet.cocAttributes) {
      out.attributes = sheet.cocAttributes;
    }
    return out;
  },

  describeForAI(): AiRuleHints {
    return {
      // Verbatim from the legacy ai_agent.ts `rulesExplanation` coc7th branch.
      rulesPrompt:
        "Room Dice Rules: COC 7th edition " +
        "(d100 rolls: 1-5 is Critical Success (大成功), 96-100 is Fumble/Critical Failure (大失败). " +
        "Lower results are better in skill checks).",
      sheetToolSchemaFields: {
        cocAttributes: {
          type: "object",
          description:
            "COC 7th attributes (required/used only if ruleTemplate is 'coc7th'). " +
            "Values should typically be between 15 and 99.",
        },
      },
    };
  },
};

// Re-exported so other rule-aware code doesn't need a direct dep on
// character-types when it only cares about the SAN cap.
export { COC_MAX_SANITY };
