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
import type { CharacterData } from "@/lib/character-types";
import {
  COC_DEFAULT_ATTRIBUTES,
  COC_MAX_SANITY,
  computeCocDerived,
  type CocAttributes,
  type CocDerived,
} from "./sheet";
import { resolveCocStat } from "./stats";
import { clampAttributes, clampInt } from "../patch-utils";
import type {
  AiRuleHints,
  AttributeKeySpec,
  CharacterStatus,
  CheckRequest,
  CheckResult,
  QuickCheckInput,
  ResourceBarSpec,
  ResourcePatch,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "../types";

// Hard cap on bonus/penalty dice in the `.rc <name>±n` syntax. COC 7th play
// rarely stacks past 2; 3 leaves headroom without inviting typo'd garbage.
const MAX_BONUS_PENALTY = 3;

/** Read a clamped bonus(+)/penalty(−) dice count out of untrusted ruleData. */
function readBonusPenalty(ruleData: Record<string, unknown> | undefined): number {
  const raw = ruleData?.bonusPenalty;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return clampInt(raw, -MAX_BONUS_PENALTY, MAX_BONUS_PENALTY, 0);
}

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
  supportedCommands: ["help", "st", "rc", "ra", "rch", "rah", "rh", "rd", "r", "sc"],
  helpEntryIds: ["stCoc", "rcD100", "rcBp", "rch", "rdr", "rh", "sc", "help"],
  resourceBars: COC_RESOURCE_BARS,
  attributeKeys: COC_ATTRIBUTE_KEYS,
  // Only 幸运 joins the hover card — the other 8 attributes belong to the
  // full sheet, not a 208px tooltip.
  statusAttributeKeys: [{ key: "luck", labelKey: "luck" }],
  defaultRollExpression: "1d100",
  requiresStoredTarget: true,
  hasRoleLevel: false,
  // HP/SAN/MP currents live on cocDerived and are host-adjustable via action.
  resourceCurrentsViaAction: true,
  quickRolls: [".rc 侦查", ".sc 1/1d6", ".rd100"],
  // Quick-check panel: pick any stored skill, any of the 9 attributes, or 理智
  // (the one resource `.rc` can target via lookupFallback), with a ±1
  // bonus/penalty-die toggle and an 暗骰 switch. Commands omit the target so
  // the server re-resolves the live stored value.
  quickCheckPanel: {
    skills: true,
    attributes: true,
    resourceKeys: ["san"],
    nameField: "select",
    bonusPenaltyDice: { max: 1 },
    hiddenToggle: true,
  },
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

  readAttributes(sheet: CharacterData): Record<string, number> {
    return { ...(sheet.cocAttributes ?? COC_DEFAULT_ATTRIBUTES) };
  },

  writeAttributes(sheet: CharacterData, values: Record<string, number>): CharacterData {
    const attrs = { ...(sheet.cocAttributes ?? COC_DEFAULT_ATTRIBUTES) };
    for (const { key } of COC_ATTRIBUTE_KEYS) {
      if (typeof values[key] === "number") attrs[key as keyof CocAttributes] = values[key];
    }
    return { ...sheet, cocAttributes: attrs };
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
    const bp = readBonusPenalty(req.ruleData);

    let roll: number;
    let rolls: number[];
    let notation = "1d100";
    let rollDisplay: string | undefined;

    if (bp === 0) {
      // Legacy path, byte-for-byte.
      roll = rollDie(100);
      rolls = [roll];
    } else {
      // COC 7th bonus/penalty dice: one units die, 1+|n| tens dice. Each
      // candidate = tens×10 + units, with the 00+0 combination reading as
      // 100. Bonus keeps the LOWEST candidate, penalty the HIGHEST.
      const units = rollDie(10) - 1; // 0..9
      const candidates = Array.from({ length: 1 + Math.abs(bp) }, () => {
        const tens = rollDie(10) - 1; // 0..9
        const v = tens * 10 + units;
        return v === 0 ? 100 : v;
      });
      roll = bp > 0 ? Math.min(...candidates) : Math.max(...candidates);
      rolls = candidates;
      // Language-neutral marker, mirroring the `.rc` syntax: b = bonus (奖励),
      // p = penalty (惩罚). Shown by the check bubble in place of the notation.
      notation = `1d100${bp > 0 ? `b${bp}` : `p${-bp}`}`;
      rollDisplay = `${notation}[${candidates.join(", ")}]`;
    }

    const passed = roll <= target;
    // Quirk #1 preserved: success boolean stays as raw (roll <= target);
    // grade may upgrade/downgrade to critical/fumble independent of it.
    const baseGrade: VisualGrade = passed ? "success" : "failure";
    const grade: VisualGrade = roll <= 5 ? "critical" : roll >= 96 ? "fumble" : baseGrade;

    return {
      skillName,
      notation,
      rolls,
      total: roll,
      target,
      passed,
      grade,
      // Shape preserved from legacy `performSkillCheck`; bonus/penalty rolls
      // add `rollDisplay` + the candidate pool without disturbing it.
      detail: {
        dice: "d100",
        count: rolls.length,
        results: rolls,
        sum: roll,
        notation,
        check: {
          skillName,
          target,
          roll,
          success: passed,
          grade,
          ...(bp !== 0 ? { bonusPenalty: bp, rollDisplay } : {}),
        },
      },
    };
  },

  /**
   * `.rc` argument parser: `<name>[±n][\s*<target>]`.
   *
   * The legacy grammar (`/^(.+?)\s*([0-9]+)$/` — trailing integer is the
   * threshold, whitespace optional, so `.rc 侦查50` must keep working) gains
   * one optional group between name and target: a signed single digit `+n`
   * (奖励骰) / `-n` (惩罚骰), n ≤ 3. Compact forms bind the sign group first:
   * `.rc 侦查+150` reads as 侦查, 1 bonus die, threshold 50.
   *
   * The count travels to `resolveCheck` via `ruleData.bonusPenalty` — the
   * generic parsed shape has no slot for it and the engine just forwards it.
   */
  parseRcArgs(args) {
    const trimmed = args.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^(.+?)(?:([+-][1-3]))?(?:\s*([0-9]+))?$/);
    if (!m) return null;

    let skillName = m[1].trim();
    if (skillName.length > 50) skillName = skillName.slice(0, 50);
    if (!skillName) return null;

    const bonusPenalty = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    const ruleData = bonusPenalty !== 0 ? { bonusPenalty } : undefined;

    if (m[3] !== undefined) {
      const value = parseInt(m[3], 10);
      if (value < 0 || value > 999) return null;
      return { skillName, explicitTarget: value, ruleData };
    }
    return { skillName, ruleData };
  },

  /**
   * Quick-check panel → command string. The command never embeds the stored
   * value (the server re-resolves it), so a stale client list can't roll
   * against an outdated threshold; the value only feeds the preview.
   */
  buildCheckCommand(input: QuickCheckInput) {
    const name = input.name.trim();
    if (!name) return null;
    const bp = clampInt(input.bonusPenalty ?? 0, -MAX_BONUS_PENALTY, MAX_BONUS_PENALTY, 0);
    const suffix = bp > 0 ? `+${bp}` : bp < 0 ? `${bp}` : "";
    const command = `${input.hidden ? ".rch" : ".rc"} ${name}${suffix}`;
    const dieLabel = `1d100${bp > 0 ? `b${bp}` : bp < 0 ? `p${-bp}` : ""}`;
    const preview = typeof input.value === "number" ? `${dieLabel} ≤ ${input.value}` : dieLabel;
    return { command, preview };
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
      rulesPrompt:
        "Room Dice Rules: COC 7th edition " +
        "(d100 rolls: 1-5 is Critical Success (大成功), 96-100 is Fumble/Critical Failure (大失败). " +
        "Lower results are better in skill checks. " +
        "Checks may carry bonus/penalty dice (奖励骰/惩罚骰): `.rc <skill>+n` rolls n extra tens dice " +
        "keeping the lowest result, `-n` keeps the highest; `.rch` is the same check visible only to the roller).",
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
