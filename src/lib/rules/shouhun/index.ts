/**
 * 狩魂者 (shouhun) rule module.
 *
 * Rulebook summary (docs/ext-rules/shouhun.md):
 *  - 3 base attributes 体魄/智慧/心魂, each 1..9 (grades E → SSS+); strength
 *    tiers are ⌊attr/2⌋ (体魄强度/术法强度/灵能力强度).
 *  - Derived resources: 生命值 = 5 + 体魄强度; 灵力值 = 5 + 智慧×2 + 心魂.
 *    Maxes are always derived — only current values persist on the sheet.
 *  - 灵识 (= attribute sum, initial 9) is a point-buy reference shown to
 *    players but not enforced (host adjudicates, like d20's free-set design).
 *  - Checks: 1d20 + x个d4 (加骰) + y个d6 (时髦骰, host-announced, -3..+3)
 *    vs DC (default 10). Success level = 1 + ⌊(total - DC) / 5⌋ on a pass.
 *
 * `.rc` syntax: `<name>[+x[±y] | -y][ <DC>]` — x/y are typed by the player
 * (no automatic sheet/skill lookup in v1, mirroring the COC host-check flow
 * where players supply the number themselves):
 *   ".rc 侦查"        → 1d20 vs DC 10
 *   ".rc 侦查+3 12"   → 1d20+3d4 vs DC 12
 *   ".rc 侦查+3+2 12" → 1d20+3d4+2d6 vs DC 12
 *   ".rc 侦查+3-2"    → 1d20+3d4-2d6 vs DC 10
 *   ".rc 侦查-2"      → 1d20-2d6 vs DC 10 (lone negative = 时髦骰 only)
 * `.r+x[±y] [DC]` is the nameless shorthand for the same check (via
 * `parseQuickCheckArgs`); other `.r` args stay plain dice rolls.
 * The x/y counts are translated into a `+xd4±yd6` modifier expression that
 * the engine evaluates (rolling the dice) before calling `resolveCheck`;
 * the check bubble shows every die face via `check.rollDisplay`.
 * Grades stay success/failure only — the rulebook defines no crit/fumble.
 */

import { rollDie } from "@/lib/utils";
import {
  SH_DEFAULT_ATTRIBUTES,
  clampShAttr,
  computeShDerived,
  shGradeLabel,
  type CharacterData,
  type ShAttributes,
  type ShSheet,
} from "@/lib/character-types";
import { resolveShStat } from "@/lib/sh-stats";
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

const SH_ATTRIBUTE_KEYS: ReadonlyArray<AttributeKeySpec> = [
  { key: "phy", labelKey: "shPhy" },
  { key: "wis", labelKey: "shWis" },
  { key: "soul", labelKey: "shSoul" },
];

const SH_RESOURCE_BARS: ReadonlyArray<ResourceBarSpec> = [
  { key: "hp", labelKey: "hp" },
  { key: "mana", labelKey: "shMana" },
];

// Rulebook bounds: 加骰 comes from skills/attributes (values stay small, but
// leave generous headroom); 时髦骰 is host-announced within -3..+3.
const MAX_BONUS_DICE = 20;
const MAX_STYLE_DICE = 3;

/**
 * Parse a trailing signed-count group (`+x`, `+x+y`, `+x-y`, or a lone `-y`)
 * into the 加骰/时髦骰 dice expression. Returns the synthesized modifier
 * expression (or undefined when both counts are zero), or null on an
 * out-of-range / ambiguous group. Shared by `.rc` and the `.r` shorthand.
 */
function parseXyGroup(group: string): { modifierExpression?: string } | null {
  const nums = (group.match(/[+-][0-9]{1,2}/g) ?? []).map((g) => parseInt(g, 10));
  if (nums.length === 0 || nums.length > 2) return null;

  let x = 0;
  let y = 0;
  if (nums[0] >= 0) {
    x = nums[0];
    y = nums.length > 1 ? nums[1] : 0;
  } else {
    // Lone negative group = 时髦骰 only; two groups starting with a negative
    // would be ambiguous (x can't be negative).
    if (nums.length > 1) return null;
    y = nums[0];
  }
  if (x > MAX_BONUS_DICE || Math.abs(y) > MAX_STYLE_DICE) return null;

  const parts: string[] = [];
  if (x > 0) parts.push(`+${x}d4`);
  if (y > 0) parts.push(`+${y}d6`);
  if (y < 0) parts.push(`-${-y}d6`);
  return { modifierExpression: parts.length ? parts.join("") : undefined };
}

const capabilities: RuleCapabilities = {
  hostLabelKey: "gm",
  playerLabelKey: "soulHunter",
  hasSanity: false,
  hasPsychologyRoll: false,
  hasManaPoints: false,
  checkMenuModes: ["check"],
  // No `.sc` — 狩魂者 has no sanity mechanic.
  supportedCommands: ["help", "st", "rc", "ra", "rh", "rd", "r"],
  resourceBars: SH_RESOURCE_BARS,
  attributeKeys: SH_ATTRIBUTE_KEYS,
  // 术法强度 (= ⌊智慧/2⌋) is surfaced as a read-only derived card in the
  // character sheet; the value comes from `computeShDerived`, never storage.
  derivedStats: [{ key: "spellStrength", labelKey: "shSpellStrength" }],
  defaultRollExpression: "1d20",
  // x/y are player-typed, so a check never needs a stored room_skills value.
  requiresStoredTarget: false,
  hasRoleLevel: false,
  // Three chips that teach the rule's own syntax at a glance:
  // named check / named check with 时髦骰 / nameless `.r` shorthand.
  quickRolls: [".rc 侦查+2 10", ".rc 侦查+2+1 12", ".r+2+1 12"],
  // Host check requests: KP enters an optional DC + 时髦骰 (and may leave the
  // check unnamed); the responding player supplies their 加骰 count.
  checkRequestOptions: {
    dcField: true,
    styleDiceField: { min: -MAX_STYLE_DICE, max: MAX_STYLE_DICE },
    skillNameOptional: true,
    responderBonusDice: { max: MAX_BONUS_DICE },
  },
};

/** Re-clamp stored current resource values to the maxes derived from attrs. */
function clampSheetToDerived(attrs: ShAttributes, sheet: ShSheet | undefined): ShSheet | undefined {
  if (!sheet) return sheet;
  const derived = computeShDerived(attrs);
  const out: ShSheet = { ...sheet };
  if (typeof out.hp_current === "number") {
    out.hp_current = Math.min(Math.max(0, out.hp_current), derived.hpMax);
  }
  if (typeof out.mana_current === "number") {
    out.mana_current = Math.min(Math.max(0, out.mana_current), derived.manaMax);
  }
  return out;
}

export const shouhunRule: RuleModule = {
  id: "shouhun",
  labelKey: "ruleTemplateShouhun",
  hintKey: "ruleTemplateShouhunHint",
  rcUsageKey: "shRcUsage",
  capabilities,

  initCharacter(): CharacterData {
    const attrs = { ...SH_DEFAULT_ATTRIBUTES };
    const derived = computeShDerived(attrs);
    return {
      ruleTemplate: "shouhun",
      shAttributes: attrs,
      shSheet: { hp_current: derived.hpMax, mana_current: derived.manaMax },
    };
  },

  computeDerived(sheet: CharacterData): CharacterData {
    if (sheet.ruleTemplate !== "shouhun" || !sheet.shAttributes) return sheet;
    // Normalize attributes into the legal 1..9 range, then re-clamp the
    // player-set current values to the maxes those attributes derive.
    const attrs: ShAttributes = {
      phy: clampShAttr(sheet.shAttributes.phy),
      wis: clampShAttr(sheet.shAttributes.wis),
      soul: clampShAttr(sheet.shAttributes.soul),
    };
    return {
      ...sheet,
      shAttributes: attrs,
      shSheet: clampSheetToDerived(attrs, sheet.shSheet),
    };
  },

  routeStat(name: string): StatRoute {
    const r = resolveShStat(name);
    if (r.kind === "attribute") return { kind: "attribute", key: r.key, canonical: r.canonical };
    if (r.kind === "resource") return { kind: "resource", key: r.key, canonical: r.canonical };
    return { kind: "skill", canonical: r.canonical };
  },

  canonicalStatName(name: string): string {
    const r = resolveShStat(name);
    return r.kind === "skill" ? name : r.canonical;
  },

  // v1 design: x/y always come from the player's typed command, never from
  // the sheet or room_skills, so there is no fallback target to look up.
  lookupFallback(): { name: string; value: number } | null {
    return null;
  },

  /**
   * `.rc` argument parser: `<name>[+x[±y] | -y][\s+<DC>]`.
   * One or two trailing signed integers: a leading `+n` is x (加骰 d4 count,
   * 0..20); the second (or a lone `-n`) is y (时髦骰 d6 count, -3..+3).
   * Out-of-range counts are usage errors, not silent clamps. The space
   * before DC is required (matching the d20 rule's documented behavior).
   */
  parseRcArgs(args) {
    const trimmed = args.trim();
    if (!trimmed) return null;

    // 1) Optional trailing " <digits>" → DC. Must be space-separated.
    let body = trimmed;
    let explicitTarget: number | undefined;
    const dcMatch = body.match(/^(.+?)\s+([0-9]+)$/);
    if (dcMatch) {
      const v = parseInt(dcMatch[2], 10);
      if (v >= 0 && v <= 999) {
        explicitTarget = v;
        body = dcMatch[1].trim();
      }
    }

    // 2) Optional trailing signed dice counts (at most two groups).
    let modifierExpression: string | undefined;
    const countMatch = body.match(/^(.+?)((?:[+-][0-9]{1,2}){1,2})$/);
    if (countMatch) {
      const xy = parseXyGroup(countMatch[2]);
      if (!xy) return null;
      modifierExpression = xy.modifierExpression;
      body = countMatch[1].trim();
    }

    let skillName = body.trim();
    if (!skillName) return null;
    if (skillName.length > 50) skillName = skillName.slice(0, 50);

    return { skillName, explicitTarget, modifierExpression };
  },

  /**
   * `.r+x[±y] [DC]` — nameless shorthand check (same dice math as `.rc`,
   * skillName left empty). Only claims args that are PURE signed-count groups
   * (optionally followed by a space-separated DC); anything else — `3d6`,
   * `+2d8`, `20` — falls through to the generic dice roller. An in-range
   * shape with an out-of-range count (e.g. `+21`) also falls through rather
   * than erroring, keeping `.r`'s contract as a general-purpose roller.
   */
  parseQuickCheckArgs(args) {
    const m = args.trim().match(/^((?:[+-][0-9]{1,2}){1,2})(?:\s+([0-9]{1,3}))?$/);
    if (!m) return null;
    const xy = parseXyGroup(m[1]);
    if (!xy) return null;
    return {
      skillName: "",
      explicitTarget: m[2] !== undefined ? parseInt(m[2], 10) : undefined,
      modifierExpression: xy.modifierExpression,
    };
  },

  applyStatWrite(sheet, route, value) {
    const data = { ...sheet };

    if (route.kind === "attribute") {
      const key = route.key as keyof ShAttributes;
      const attrs: ShAttributes = { ...(data.shAttributes ?? SH_DEFAULT_ATTRIBUTES) };
      const finalValue = clampShAttr(value);
      attrs[key] = finalValue;
      data.shAttributes = attrs;
      // Derived maxes moved — re-clamp any player-set current values.
      data.shSheet = clampSheetToDerived(attrs, data.shSheet);
      return { sheet: data, finalValue };
    }

    // resource — clamp to the max derived from the current attributes.
    const attrs = data.shAttributes ?? SH_DEFAULT_ATTRIBUTES;
    const derived = computeShDerived(attrs);
    const max = route.key === "hp" ? derived.hpMax : derived.manaMax;
    const finalValue = Math.min(Math.max(0, value), max);
    const meta: ShSheet = { ...(data.shSheet ?? {}) };
    meta[`${route.key}_current` as keyof ShSheet] = finalValue;
    data.shSheet = meta;
    return { sheet: data, finalValue };
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const dc = req.explicitTarget ?? 10;
    const modifier = req.modifierValue ?? 0;
    const roll = rollDie(20);
    const total = roll + modifier;
    const passed = total >= dc;
    // Rulebook: success level = 1 + ⌊overflow/5⌋; failures carry no level.
    const successLevel = passed ? 1 + Math.floor((total - dc) / 5) : undefined;
    const grade: VisualGrade = passed ? "success" : "failure";

    // Structural notation (`1d20+2d4-1d6`) and per-die breakdown
    // (`d20[14] + 2d4[3, 4] - 1d6[2]`) from the engine-evaluated terms. The
    // bubble shows every die face — never just the summed modifier. Falls
    // back to the flat `1d20±N` form when no term breakdown was provided.
    let notation = "1d20";
    let rollDisplay = `d20[${roll}]`;
    if (req.modifierTerms?.length) {
      for (const term of req.modifierTerms) {
        if (term.isConstant) {
          notation += `${term.sign}${term.sum}`;
          rollDisplay += ` ${term.sign} ${term.sum}`;
        } else {
          notation += `${term.sign}${term.count}d${term.faces}`;
          rollDisplay += ` ${term.sign} ${term.count}d${term.faces}[${term.rolls.join(", ")}]`;
        }
      }
    } else if (modifier !== 0) {
      notation += modifier > 0 ? `+${modifier}` : `${modifier}`;
    }

    return {
      skillName: req.skillName,
      notation,
      rolls: [roll],
      total,
      target: dc,
      passed,
      grade,
      detail: {
        // `dice: "d20"` reuses the d20 chat template ("d20+x=N vs DC M").
        dice: "d20",
        count: 1,
        results: [roll],
        sum: total,
        notation,
        check: {
          skillName: req.skillName,
          target: dc,
          roll: total,
          success: passed,
          grade,
          raw: roll,
          modifier,
          modifierExpression: req.modifierDisplay ?? null,
          successLevel: successLevel ?? null,
          // Per-die breakdown shown in place of the plain notation.
          rollDisplay,
        },
      },
    };
  },

  exportSnapshot(sheet: CharacterData): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const attrs = sheet.shAttributes;
    if (attrs) {
      const derived = computeShDerived(attrs);
      out.attributes = attrs;
      out.grades = {
        phy: shGradeLabel(attrs.phy),
        wis: shGradeLabel(attrs.wis),
        soul: shGradeLabel(attrs.soul),
      };
      out.strengths = {
        phyStrength: derived.phyStrength,
        spellStrength: derived.spellStrength,
        psychicStrength: derived.psychicStrength,
      };
      out.spiritSense = derived.spiritSense;
      out.hp = sheet.shSheet?.hp_current ?? derived.hpMax;
      out.hpMax = derived.hpMax;
      out.mana = sheet.shSheet?.mana_current ?? derived.manaMax;
      out.manaMax = derived.manaMax;
    }
    return out;
  },

  describeForAI(): AiRuleHints {
    return {
      rulesPrompt:
        "Room Dice Rules: 狩魂者 (Soul Hunter) " +
        "(checks roll 1d20 + x d4 bonus dice + y d6 style dice vs DC, default DC 10; " +
        "total ≥ DC succeeds; success level = 1 + floor((total - DC) / 5); no crit/fumble. " +
        "Players type x/y themselves as `.rc <name>+x±y <DC>` (or the nameless shorthand " +
        "`.r+x±y <DC>`) — x is from their skill/attribute, " +
        "y (-3..+3) is announced by the host. Characters have 3 attributes 体魄/智慧/心魂, each 1-9 " +
        "(grades E to SSS+); strength tier = floor(attr / 2); HP = 5 + 体魄强度; " +
        "灵力 (mana) = 5 + 智慧×2 + 心魂; 灵识 (spirit sense) = attribute sum, initial 9).",
      sheetToolSchemaFields: {
        shAttributes: {
          type: "object",
          description:
            "狩魂者 attributes (only when ruleTemplate is 'shouhun'). " +
            "3 keys, each an integer 1-9: phy (体魄), wis (智慧), soul (心魂). " +
            "HP/mana maxes are derived automatically.",
          properties: {
            phy: { type: "integer", description: "体魄 (1-9)" },
            wis: { type: "integer", description: "智慧 (1-9)" },
            soul: { type: "integer", description: "心魂 (1-9)" },
          },
        },
        shSheet: {
          type: "object",
          description:
            "狩魂者 current resources (only when ruleTemplate is 'shouhun'). " +
            "Fields: hp_current (number, clamped to 5+体魄强度), " +
            "mana_current (number, clamped to 5+智慧×2+心魂).",
        },
      },
    };
  },
};
