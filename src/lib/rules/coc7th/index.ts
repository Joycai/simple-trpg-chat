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
import { clampAttributes } from "../patch-utils";
import type {
  AiRuleHints,
  AttributeKeySpec,
  CharacterStatus,
  CheckRequest,
  CheckResult,
  ResourceBarSpec,
  ResourcePatch,
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
  hostLabelKey: "kp",
  playerLabelKey: "investigator",
  hasSanity: true,
  hasPsychologyRoll: true,
  hasManaPoints: true,
  checkMenuModes: ["check", "psychology", "sancheck"],
  supportedCommands: ["help", "st", "rc", "ra", "rh", "rd", "r", "sc"],
  resourceBars: COC_RESOURCE_BARS,
  attributeKeys: COC_ATTRIBUTE_KEYS,
  // Only 幸运 joins the hover card — the other 8 attributes belong to the
  // full sheet, not a 208px tooltip.
  statusAttributeKeys: [{ key: "luck", labelKey: "luck" }],
  defaultRollExpression: "1d100",
  requiresStoredTarget: true,
  hasRoleLevel: false,
  quickRolls: [".rc 侦查", ".sc 1/1d6", ".rd100"],
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

  readStatus(sheet: CharacterData): CharacterStatus {
    const d = sheet.cocDerived;
    if (!d) return { resources: {} };
    return {
      resources: {
        hp:  { current: d.hp_current ?? d.hp,   max: d.hpMax  },
        san: { current: d.san_current ?? d.san, max: d.sanMax },
        mp:  { current: d.mp_current ?? d.mp,   max: d.mpMax  },
      },
      // 幸运 lives on the attribute bag but is mirrored into cocDerived.
      attributes: { luck: d.luck },
    };
  },

  /**
   * Accepts the one field `describeForAI` declares: `cocAttributes`.
   * 0–99 is the COC 7th percentile range; 50 is the average human, which is
   * the least surprising value to fall back to when the model sends garbage.
   * HP/SAN/MP are not patchable — they derive from these, and `computeDerived`
   * recomputes them after this returns.
   */
  applySheetPatch(sheet: CharacterData, patch: Record<string, unknown>): CharacterData {
    const clamped = clampAttributes(patch.cocAttributes, COC_ATTRIBUTE_KEYS, 0, 99, 50);
    if (!clamped) return sheet;
    return {
      ...sheet,
      cocAttributes: { ...(sheet.cocAttributes ?? COC_DEFAULT_ATTRIBUTES), ...clamped },
    };
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

  /**
   * Replicates the legacy engine regex `/^(.+?)\s*([0-9]+)$/` byte-for-byte:
   * trailing integer is the target threshold, with optional whitespace
   * separator. Honoring `.rc 侦查50` (no space) is mandatory for back-compat.
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

  /**
   * Hosts the attribute/resource write logic that used to live inline in
   * `syncCharacterStat` (commands.ts:306-343). Byte-for-byte compatible:
   *  - attribute: write `cocAttributes[key]`, recompute derived while
   *    preserving player-set current resource values (clamped to new maxes).
   *  - resource: clamp to `${key}Max` (SAN cap forced to 99 per COC 7th),
   *    write both base field (read by export.ts) and `${key}_current`
   *    (read by CharacterPanel).
   */
  applyStatWrite(sheet, route, value) {
    const data = { ...sheet };
    let finalValue = value;

    if (route.kind === "attribute") {
      const key = route.key as keyof CocAttributes;
      const attrs = { ...(data.cocAttributes ?? COC_DEFAULT_ATTRIBUTES) };
      attrs[key] = value;
      data.cocAttributes = attrs;

      const prev: Partial<CocDerived> = data.cocDerived || {};
      const recomputed = computeCocDerived(attrs);
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
      data.cocDerived = recomputed;
      return { sheet: data, finalValue };
    }

    // resource
    const resKey = route.key;
    const derived: CocDerived = data.cocDerived
      ? { ...data.cocDerived }
      : computeCocDerived(data.cocAttributes ?? COC_DEFAULT_ATTRIBUTES);
    const d = derived as CocDerived & Record<string, number | undefined>;
    const maxKey = `${resKey}Max`;
    let max: number;
    if (resKey === "san") {
      max = COC_MAX_SANITY;
      d[maxKey] = max;
    } else if (typeof d[maxKey] === "number") {
      max = d[maxKey] as number;
    } else {
      max = value;
      d[maxKey] = max;
    }
    finalValue = Math.min(Math.max(0, value), max);
    d[resKey] = finalValue;
    d[`${resKey}_current`] = finalValue;
    data.cocDerived = derived;
    return { sheet: data, finalValue };
  },

  // Batch resource edit (HP/SAN/MP steppers). Hosts the cocDerived clamping
  // that used to live in updateResourcesAction's COC/basic else-branch.
  applyResourcePatch(sheet: CharacterData, patch: ResourcePatch): CharacterData {
    const data = { ...sheet };
    const derived: CocDerived = data.cocDerived
      ? { ...data.cocDerived }
      : { hp: 0, hpMax: 0, san: 0, sanMax: 0, mp: 0, mpMax: 0, mov: 0, db: "0", build: 0, luck: 0 };
    if (patch.hp_current !== undefined) {
      derived.hp_current = Math.max(0, Math.min(patch.hp_current, derived.hpMax));
    }
    if (patch.san_current !== undefined) {
      derived.san_current = Math.max(0, Math.min(patch.san_current, derived.sanMax));
    }
    if (patch.mp_current !== undefined) {
      derived.mp_current = Math.max(0, Math.min(patch.mp_current, derived.mpMax));
    }
    data.cocDerived = derived;
    return data;
  },

  // Plain-roll reading for the AI agent: COC 7th crit/fumble bounds on a raw
  // 1d100 (moved verbatim out of ai_agent.ts's rule-id branch).
  naturalGrade(roll: number, faces: number, count: number): string | null {
    if (faces === 100 && count === 1) {
      if (roll <= 5) return "Critical Success (大成功)";
      if (roll >= 96) return "Fumble (大失败)";
    }
    return null;
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
          properties: {
            str: { type: "integer", description: "Strength" },
            con: { type: "integer", description: "Constitution" },
            siz: { type: "integer", description: "Size" },
            dex: { type: "integer", description: "Dexterity" },
            app: { type: "integer", description: "Appearance" },
            int: { type: "integer", description: "Intelligence" },
            pow: { type: "integer", description: "Power" },
            edu: { type: "integer", description: "Education" },
            luck: { type: "integer", description: "Luck" },
          },
        },
      },
    };
  },
};

// Re-exported so other rule-aware code doesn't need a direct dep on
// character-types when it only cares about the SAN cap.
export { COC_MAX_SANITY };
