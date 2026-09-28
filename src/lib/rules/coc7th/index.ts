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
 *  2. SAN max is always 99 (`COC_MAX_SANITY`), never tied to POW; POW only
 *     sets the starting value (`sanStart`, the SAN resource's initial).
 *  3. HP / MP maxes derive from attributes (`derive`), so the generic
 *     `applySheetEdit` re-clamps stored currents whenever an attribute edit
 *     lowers a max.
 */

import { rollDie } from "@/lib/commands/dice";
import { statValue } from "@/lib/character/sheet-model";
import {
  COC_DEFAULT_ATTRIBUTES,
  computeCocDerived,
  type CocAttributes,
} from "./sheet";
import { getSkillAliasCandidates, resolveCocStat } from "./stats";
import { clampInt } from "../patch-utils";
import type { SheetSchema } from "../sheet-schema";
import { COC_STANDARD_SKILLS } from "./skills";
import { legacyAttributes, legacyBase, legacyCurrent, setResource } from "@/lib/character/legacy";
import type {
  AiRuleHints,
  CheckRequest,
  CheckResult,
  QuickCheckInput,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "../types";

// Hard cap on bonus/penalty dice (`.rc b2 侦查` / `.rd100b2` / `.rc 侦查+2`).
// COC 7th play rarely stacks past 2; 3 leaves headroom without inviting
// typo'd garbage.
const MAX_BONUS_PENALTY = 3;

/** Read a clamped bonus(+)/penalty(−) dice count out of untrusted ruleData. */
function readBonusPenalty(ruleData: Record<string, unknown> | undefined): number {
  const raw = ruleData?.bonusPenalty;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return clampInt(raw, -MAX_BONUS_PENALTY, MAX_BONUS_PENALTY, 0);
}

/**
 * Structured bonus/penalty roll payload persisted in the dice detail — the
 * chat card renders every number from this, so the mechanic is transparent:
 * which faces the extra dice showed, what the original d100 was, and what the
 * replacement produced.
 */
export interface CocBpRoll {
  type: "bonus" | "penalty";
  /** Extra tens dice count, 1..3. */
  count: number;
  /** Units die, 0..9 (shared by every candidate). */
  units: number;
  /** The original d100's tens face, 0..9 (0 = the die's 0/10 face). */
  originalTens: number;
  /** The original, unreplaced d100 value (1..100). */
  original: number;
  /** Each extra die: the face it showed and the candidate value it produces. */
  extra: Array<{ face: number; value: number }>;
  /** Chosen result — lowest candidate for bonus, highest for penalty. */
  final: number;
}

/**
 * Roll a d100 with `n` bonus (n>0) / penalty (n<0) dice, per COC 7th RAW:
 * roll tens + units as separate d10s, then |n| extra tens dice; every tens
 * face pairs with the SAME units die, and bonus keeps the lowest result while
 * penalty keeps the highest. Faces are 0..9 where 0 is the die's 0/10 face —
 * a 0-face pairs with units 0 as 100 (the 00+0 fumble convention) and with a
 * non-zero units as just the units value (1..9).
 */
function rollBonusPenalty(n: number): CocBpRoll {
  const units = rollDie(10) - 1; // 0..9
  const combine = (tens: number) => {
    const v = tens * 10 + units;
    return v === 0 ? 100 : v;
  };
  const originalTens = rollDie(10) - 1;
  const original = combine(originalTens);
  const extra = Array.from({ length: Math.abs(n) }, () => {
    const face = rollDie(10) - 1;
    return { face, value: combine(face) };
  });
  const candidates = [original, ...extra.map((e) => e.value)];
  const final = n > 0 ? Math.min(...candidates) : Math.max(...candidates);
  return {
    type: n > 0 ? "bonus" : "penalty",
    count: Math.abs(n),
    units,
    originalTens,
    original,
    extra,
    final,
  };
}

const capabilities: RuleCapabilities = {
  hostLabelKey: "kp",
  playerLabelKey: "investigator",
  hasSanity: true,
  hasPsychologyRoll: true,
  checkMenuModes: ["check", "psychology", "sancheck"],
  supportedCommands: ["help", "st", "rc", "ra", "rch", "rah", "rh", "rd", "r", "sc"],
  helpEntryIds: ["stCoc", "rcD100", "rcBp", "rdBp", "rch", "rdr", "rh", "sc", "help"],
  defaultRollExpression: "1d100",
  requiresStoredTarget: true,
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

/** COC attribute range: the 0–99 percentile scale (same as the AI clamp). */
const cocAttr = (key: keyof CocAttributes, labelKey: string, extra: { shortLabelKey?: string; inStatus?: boolean } = {}) =>
  ({ key, labelKey, min: 0, max: 99, default: COC_DEFAULT_ATTRIBUTES[key], required: true, ...extra });

const COC_SHEET: SheetSchema = {
  attributes: [
    cocAttr("str", "str"), cocAttr("dex", "dex"), cocAttr("con", "con"),
    cocAttr("int", "int"), cocAttr("pow", "pow"), cocAttr("edu", "edu"),
    cocAttr("siz", "siz"), cocAttr("app", "app"),
    cocAttr("luck", "luckAttr", { shortLabelKey: "luck", inStatus: true }),
  ],
  resources: [
    { key: "hp", labelKey: "hp", style: "bar", max: { derived: "hpMax" }, initial: "max", required: false },
    // SAN starts at POW; its cap is 99 regardless (Cthulhu Mythos isn't tracked).
    { key: "san", labelKey: "san", style: "bar", max: { derived: "sanMax" }, initial: { derived: "sanStart" }, required: false },
    { key: "mp", labelKey: "mp", style: "bar", max: { derived: "mpMax" }, initial: "max", required: false },
  ],
  derived: [
    { key: "hpMax", labelKey: "hp", display: "hidden" },
    { key: "mpMax", labelKey: "mp", display: "hidden" },
    { key: "sanMax", labelKey: "san", display: "hidden" },
    { key: "sanStart", labelKey: "san", display: "hidden" },
    { key: "mov", labelKey: "mov", display: "sheet", formulaKey: "movFormula" },
    { key: "db", labelKey: "damageBonus", display: "sheet", format: "text", formulaKey: "dbFormula" },
    { key: "build", labelKey: "build", display: "sheet", formulaKey: "dbFormula" },
  ],
  standardSkills: COC_STANDARD_SKILLS,
  profile: { roleLevel: false },
  customAttributes: {},
};

export const coc7thRule: RuleModule = {
  id: "coc7th",
  labelKey: "ruleTemplateCoc7th",
  hintKey: "ruleTemplateHint",
  capabilities,
  sheet: COC_SHEET,

  derive(a) {
    const d = computeCocDerived({ ...COC_DEFAULT_ATTRIBUTES, ...a } as CocAttributes);
    return {
      hpMax: d.hpMax, mpMax: d.mpMax, sanMax: d.sanMax, sanStart: d.san,
      mov: d.mov, db: d.db, build: d.build,
    };
  },

  migrateLegacy(legacy) {
    const out = legacyBase(legacy, "coc7th");
    out.attributes = legacyAttributes(legacy.cocAttributes, { ...COC_DEFAULT_ATTRIBUTES });
    const d = computeCocDerived({ ...COC_DEFAULT_ATTRIBUTES, ...legacy.cocAttributes } as CocAttributes);
    const old = legacy.cocDerived;
    if (old) {
      setResource(out, "hp", { current: legacyCurrent(old.hp_current, d.hpMax) });
      // `.st san` wrote the base `san` field too; older rows may lack san_current.
      const san = typeof old.san_current === "number" ? old.san_current
        : typeof old.san === "number" && old.san !== d.san ? old.san : undefined;
      setResource(out, "san", { current: legacyCurrent(san, d.san) });
      setResource(out, "mp", { current: legacyCurrent(old.mp_current, d.mpMax) });
    }
    return out;
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
    // A sheet built for another rule (mid rule switch) has no COC stats.
    if (!sheet || sheet.ruleTemplate !== "coc7th") return null;
    const resolved = resolveCocStat(name);
    if (resolved.kind === "skill") return null;
    const value = statValue(coc7thRule, sheet, resolved);
    return value === undefined ? null : { name: resolved.canonical, value };
  },

  skillAliasCandidates(name: string): string[] {
    return getSkillAliasCandidates(name);
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const { skillName, target } = req;
    const bpCount = readBonusPenalty(req.ruleData);

    let roll: number;
    let rolls: number[];
    let notation = "1d100";
    let bp: CocBpRoll | undefined;

    if (bpCount === 0) {
      // Legacy path, byte-for-byte.
      roll = rollDie(100);
      rolls = [roll];
    } else {
      // Bonus/penalty dice: extra tens dice replace the original tens digit
      // (see rollBonusPenalty). The structured payload travels in the detail
      // so the chat card can show every face, the original, and the result.
      bp = rollBonusPenalty(bpCount);
      roll = bp.final;
      rolls = [bp.original, ...bp.extra.map((e) => e.value)];
      // Language-neutral marker, mirroring the `.rc` syntax: b = bonus (奖励),
      // p = penalty (惩罚).
      notation = `1d100${bp.type === "bonus" ? "b" : "p"}${bp.count}`;
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
      // add the structured `bp` payload (→ chat renders the 奖惩骰 card).
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
          ...(bp ? { bp } : {}),
        },
      },
    };
  },

  /**
   * `.rc` argument parser: `[b|p[n]] <name>[±n][\s*<target>]`.
   *
   * Two ways to ask for bonus/penalty dice, both landing in
   * `ruleData.bonusPenalty` (the engine forwards it to `resolveCheck`):
   *  - canonical prefix token: `.rc b 侦查` / `.rc b2 侦查 60` / `.rc p2 侦查`
   *    (case-insensitive; count defaults to 1);
   *  - suffix shorthand: `.rc 侦查+1` / `.rc 侦查-2 60` (compact forms bind
   *    the sign group first: `.rc 侦查+150` = 1 bonus die, threshold 50).
   * When both appear the prefix wins.
   *
   * The legacy grammar (`/^(.+?)\s*([0-9]+)$/` — trailing integer is the
   * threshold, whitespace optional, so `.rc 侦查50` must keep working) is
   * otherwise preserved byte-for-byte.
   */
  parseRcArgs(args) {
    let trimmed = args.trim();
    if (!trimmed) return null;

    // 1) Optional leading `b[n]` / `p[n]` token (must be followed by a space
    // so a skill legitimately starting with b/p isn't swallowed).
    let prefixBp: number | undefined;
    const prefix = trimmed.match(/^([bp])([1-3])?\s+(.+)$/i);
    if (prefix) {
      const count = prefix[2] ? parseInt(prefix[2], 10) : 1;
      prefixBp = prefix[1].toLowerCase() === "b" ? count : -count;
      trimmed = prefix[3].trim();
    }

    // 2) Name + optional suffix sign group + optional trailing threshold.
    const m = trimmed.match(/^(.+?)(?:([+-][1-3]))?(?:\s*([0-9]+))?$/);
    if (!m) return null;

    let skillName = m[1].trim();
    if (skillName.length > 50) skillName = skillName.slice(0, 50);
    if (!skillName) return null;

    const bonusPenalty = prefixBp ?? (m[2] !== undefined ? parseInt(m[2], 10) : 0);
    const ruleData = bonusPenalty !== 0 ? { bonusPenalty } : undefined;

    if (m[3] !== undefined) {
      const value = parseInt(m[3], 10);
      if (value < 0 || value > 999) return null;
      return { skillName, explicitTarget: value, ruleData };
    }
    return { skillName, ruleData };
  },

  /**
   * `.rd100b2` / `.rd100p` / `.r 100b2` / `.rh100b2` — a PLAIN bonus/penalty
   * d100 roll (no target, no judgment; the hidden `.rh` form is the 暗投).
   * The bare `b2` / `p` forms (`.r b2`) are accepted too. Anything else —
   * including out-of-range counts — returns null and falls through to the
   * generic dice parser, keeping `.r`'s contract as a general roller.
   */
  resolvePlainRoll(args) {
    const m = args.trim().match(/^(?:100)?\s*([bp])\s*([1-3])?$/i);
    if (!m) return null;
    const count = m[2] ? parseInt(m[2], 10) : 1;
    const bp = rollBonusPenalty(m[1].toLowerCase() === "b" ? count : -count);
    const notation = `1d100${bp.type === "bonus" ? "b" : "p"}${bp.count}`;
    return {
      notation,
      display: `${bp.original} → ${bp.final}`,
      total: bp.final,
      detail: {
        dice: "d100",
        count: 1 + bp.count,
        results: [bp.original, ...bp.extra.map((e) => e.value)],
        sum: bp.final,
        notation,
        // Structured payload → chat renders the 奖惩骰 card (same shape the
        // check flow embeds under `check.bp`).
        bpRoll: bp,
      },
    };
  },

  /**
   * Quick-check panel → command string, using the canonical prefix form
   * (`.rc b1 侦查`). The command never embeds the stored value (the server
   * re-resolves it), so a stale client list can't roll against an outdated
   * threshold; the value only feeds the preview.
   */
  buildCheckCommand(input: QuickCheckInput) {
    const name = input.name.trim();
    if (!name) return null;
    const bp = clampInt(input.bonusPenalty ?? 0, -MAX_BONUS_PENALTY, MAX_BONUS_PENALTY, 0);
    const token = bp > 0 ? `b${bp} ` : bp < 0 ? `p${-bp} ` : "";
    const command = `${input.hidden ? ".rch" : ".rc"} ${token}${name}`;
    const dieLabel = `1d100${bp > 0 ? `b${bp}` : bp < 0 ? `p${-bp}` : ""}`;
    const preview = typeof input.value === "number" ? `${dieLabel} ≤ ${input.value}` : dieLabel;
    return { command, preview };
  },

  // Plain-roll reading for the AI agent: COC 7th crit/fumble bounds on a raw
  // 1d100 (moved verbatim out of ai/agent.ts's rule-id branch).
  naturalGrade(roll: number, faces: number, count: number): string | null {
    if (faces === 100 && count === 1) {
      if (roll <= 5) return "Critical Success (大成功)";
      if (roll >= 96) return "Fumble (大失败)";
    }
    return null;
  },

  describeForAI(): AiRuleHints {
    return {
      rulesPrompt:
        "Room Dice Rules: COC 7th edition " +
        "(d100 rolls: 1-5 is Critical Success (大成功), 96-100 is Fumble/Critical Failure (大失败). " +
        "Lower results are better in skill checks. " +
        "Checks may carry bonus/penalty dice (奖励骰/惩罚骰): `.rc b<n> <skill>` (or `.rc <skill>+n`) rolls n " +
        "extra tens dice replacing the tens digit and keeps the lowest result; `p<n>` / `-n` keeps the highest. " +
        "`.rd100b<n>` / `.rd100p<n>` is the plain bonus/penalty roll without a check; " +
        "`.rch` is the same check visible only to the roller).",
    };
  },
};
