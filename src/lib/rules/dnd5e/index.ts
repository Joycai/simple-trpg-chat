/**
 * DnD 5e (d20) rule module.
 *
 * v1 design — intentionally minimal:
 *  - 8 free-set attributes: str/dex/con/int/wis/cha + pb (proficiency bonus)
 *    + ac (armor class). NO automatic derivation — players control everything.
 *  - 1 resource: HP (current/max).
 *  - role (free text) + level (free integer) as sheet meta.
 *  - `.rc <name>[<±mod-formula>] [<DC>]`: rolls d20 + player-supplied modifier
 *    vs DC. Default DC = 10. Modifier formula may embed dice (e.g. `+1+1d6`)
 *    — the engine evaluates it before calling `resolveCheck`.
 *  - nat 20 → critical; nat 1 → fumble; pass = total ≥ DC.
 *  - NO advantage/disadvantage, NO saves, NO class system in v1.
 */

import { rollDie } from "@/lib/utils";
import type { CharacterData, D20Attributes, D20Sheet } from "@/lib/character-types";
import { D20_DEFAULT_ATTRIBUTES } from "@/lib/character-types";
import { resolveD20Stat } from "@/lib/d20-stats";
import { clampAttributes, clampInt } from "../patch-utils";
import type {
  AiRuleHints,
  AttributeKeySpec,
  CharacterStatus,
  CheckRequest,
  CheckResult,
  ResourceBarSpec,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "../types";

// 8 attribute cards rendered in the character panel grid, in order.
const D20_ATTRIBUTE_KEYS: ReadonlyArray<AttributeKeySpec> = [
  { key: "str", labelKey: "str" },
  { key: "dex", labelKey: "dex" },
  { key: "con", labelKey: "con" },
  { key: "int", labelKey: "int" },
  { key: "wis", labelKey: "wis" },
  { key: "cha", labelKey: "cha" },
  { key: "pb",  labelKey: "pb"  },
  { key: "ac",  labelKey: "ac"  },
];

const D20_RESOURCE_BARS: ReadonlyArray<ResourceBarSpec> = [
  { key: "hp", labelKey: "hp" },
];

const capabilities: RuleCapabilities = {
  hostLabelKey: "dm",
  playerLabelKey: "adventurer",
  hasSanity: false,
  hasPsychologyRoll: false,
  hasManaPoints: false,
  checkMenuModes: ["check"],
  // No `.sc` — d20 has no sanity. `.st/.rc/.ra/.rh/.rd/.r` all supported.
  supportedCommands: ["help", "st", "rc", "ra", "rh", "rd", "r"],
  resourceBars: D20_RESOURCE_BARS,
  attributeKeys: D20_ATTRIBUTE_KEYS,
  // AC is the one number a d20 table asks for constantly ("what's your AC?"),
  // so it joins HP on the hover card; the six abilities stay on the sheet.
  statusAttributeKeys: [{ key: "ac", labelKey: "ac" }],
  defaultRollExpression: "1d20",
  requiresStoredTarget: false,
  hasRoleLevel: true,
  quickRolls: [".rd20", ".rc 力量+2 15"],
};

/** HP clamp helper — the only "derived" calculation in v1. */
function clampHp(sheet: D20Sheet | undefined): D20Sheet | undefined {
  if (!sheet) return sheet;
  const out = { ...sheet };
  if (typeof out.hpMax === "number" && typeof out.hp_current === "number") {
    out.hp_current = Math.min(Math.max(0, out.hp_current), out.hpMax);
  }
  return out;
}

export const dnd5eRule: RuleModule = {
  id: "dnd5e",
  labelKey: "ruleTemplateDnd5e",
  hintKey: "ruleTemplateDnd5eHint",
  rcUsageKey: "d20RcUsage",
  capabilities,

  initCharacter(): CharacterData {
    return {
      ruleTemplate: "dnd5e",
      d20Attributes: { ...D20_DEFAULT_ATTRIBUTES },
      d20Sheet: { level: 1, hpMax: 10, hp_current: 10 },
    };
  },

  computeDerived(sheet: CharacterData): CharacterData {
    if (sheet.ruleTemplate !== "dnd5e") return sheet;
    // Only "derivation": clamp HP current to its max. Everything else is
    // free-set per v1 design.
    const clamped = clampHp(sheet.d20Sheet);
    if (clamped === sheet.d20Sheet) return sheet;
    return { ...sheet, d20Sheet: clamped };
  },

  readStatus(sheet: CharacterData): CharacterStatus {
    const d = sheet.d20Sheet;
    const ac = sheet.d20Attributes?.ac;
    return {
      // HP needs a max to draw a bar; AC is independent of it, so a sheet with
      // only attributes filled in still contributes its AC.
      resources: d && typeof d.hpMax === "number"
        ? { hp: { current: d.hp_current ?? d.hpMax, max: d.hpMax } }
        : {},
      attributes: typeof ac === "number" ? { ac } : undefined,
    };
  },

  /**
   * Accepts `d20Attributes` + `d20Sheet`, the two fields `describeForAI`
   * declares. Abilities and AC top out at 30 (well past the 20 cap so homebrew
   * still fits); pb is bounded by the same range rather than 2–6 for the same
   * reason. Level 1–30 and HP 0–999 are similarly generous — the point is to
   * reject nonsense, not to enforce the rulebook.
   */
  applySheetPatch(sheet: CharacterData, patch: Record<string, unknown>): CharacterData {
    const out = { ...sheet };

    const attrs = clampAttributes(patch.d20Attributes, D20_ATTRIBUTE_KEYS, 0, 30, 10);
    if (attrs) {
      out.d20Attributes = { ...(out.d20Attributes ?? D20_DEFAULT_ATTRIBUTES), ...attrs };
    }

    if (patch.d20Sheet && typeof patch.d20Sheet === "object") {
      const incoming = patch.d20Sheet as Record<string, unknown>;
      const meta: D20Sheet = { ...(out.d20Sheet ?? {}) };
      if (typeof incoming.role === "string") meta.role = incoming.role.slice(0, 64);
      if (incoming.level !== undefined) meta.level = clampInt(incoming.level, 1, 30, 1);
      if (incoming.hpMax !== undefined) meta.hpMax = clampInt(incoming.hpMax, 0, 999, 10);
      if (incoming.hp_current !== undefined) meta.hp_current = clampInt(incoming.hp_current, 0, 999, 0);
      out.d20Sheet = meta;
    }

    return out;
  },

  routeStat(name: string): StatRoute {
    const r = resolveD20Stat(name);
    if (r.kind === "attribute") return { kind: "attribute", key: r.key, canonical: r.canonical };
    if (r.kind === "resource") return { kind: "resource", key: r.key, canonical: r.canonical };
    return { kind: "skill", canonical: r.canonical };
  },

  canonicalStatName(name: string): string {
    const r = resolveD20Stat(name);
    return r.kind === "skill" ? name : r.canonical;
  },

  // v1 design: ALL modifier sourcing happens via the player-typed formula
  // in `.rc <name>+<mod> <DC>`. The sheet is not auto-consulted for ability
  // mods, so lookupFallback always returns null and `requiresStoredTarget:
  // false` keeps the engine from erroring on missing room_skills rows.
  lookupFallback(): { name: string; value: number } | null {
    return null;
  },

  /**
   * `.rc` argument parser for d20:
   *   `<name>[<+/-mod-formula>][\s+<DC>]`
   *
   * Examples (see plan §3.4):
   *   "str"             → {skillName: "str"}
   *   "str+3"           → {skillName: "str", modifierExpression: "+3"}
   *   "str 15"          → {skillName: "str", explicitTarget: 15}
   *   "str+3 15"        → {skillName: "str", modifierExpression: "+3", explicitTarget: 15}
   *   "athletics+1+1d6 12" → all three set, mod formula contains a die
   *
   * The space before DC is required — `str15` is read as skillName="str15"
   * (no DC, no modifier), not as str+DC=15. This is intentional and
   * documented; players supply DC after a space.
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

    // 2) Optional trailing modifier formula starting with +/-. The formula
    // body is digits + d + numbers + +/-, with no whitespace.
    let modifierExpression: string | undefined;
    const modMatch = body.match(/^(.+?)([+-][0-9dD+\-]+)$/);
    if (modMatch) {
      const candidate = modMatch[2];
      // Reject a stray sign with nothing valid after it.
      if (/^[+-]([0-9]+([dD][0-9]+)?)([+-][0-9]+([dD][0-9]+)?)*$/.test(candidate)) {
        modifierExpression = candidate;
        body = modMatch[1].trim();
      }
    }

    let skillName = body.trim();
    if (!skillName) return null;
    if (skillName.length > 50) skillName = skillName.slice(0, 50);

    return { skillName, explicitTarget, modifierExpression };
  },

  applyStatWrite(sheet, route, value) {
    const data = { ...sheet };

    if (route.kind === "attribute") {
      const key = route.key as keyof D20Attributes;
      const attrs: D20Attributes = { ...(data.d20Attributes ?? D20_DEFAULT_ATTRIBUTES) };
      attrs[key] = value;
      data.d20Attributes = attrs;
      // No derivation chain to retrigger for attribute writes (per v1 design
      // — no auto AC from dex, no auto pb from level).
      return { sheet: data, finalValue: value };
    }

    // resource — HP only in v1.
    const meta: D20Sheet = { ...(data.d20Sheet ?? {}) };
    if (route.key === "hp") {
      // Clamp to hpMax if set; else accept the raw value and treat it as new max.
      if (typeof meta.hpMax === "number") {
        const clamped = Math.min(Math.max(0, value), meta.hpMax);
        meta.hp_current = clamped;
        data.d20Sheet = meta;
        return { sheet: data, finalValue: clamped };
      }
      meta.hp_current = Math.max(0, value);
      meta.hpMax = meta.hp_current;
      data.d20Sheet = meta;
      return { sheet: data, finalValue: meta.hp_current };
    }
    return { sheet: data, finalValue: value };
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const dc = req.explicitTarget ?? 10;
    const modifier = req.modifierValue ?? 0;
    const roll = rollDie(20);
    const total = roll + modifier;
    const passed = total >= dc;
    const grade: VisualGrade =
      roll === 20 ? "critical"
      : roll === 1 ? "fumble"
      : passed ? "success" : "failure";

    const modStr =
      modifier === 0 ? "" :
      modifier > 0 ? `+${modifier}` : `${modifier}`;
    const notation = `1d20${modStr}`;

    return {
      skillName: req.skillName,
      notation,
      rolls: [roll],
      total,
      target: dc,
      passed,
      grade,
      detail: {
        // `dice: "d20"` is the discriminator the engine uses to pick the
        // d20 chat message template.
        dice: "d20",
        count: 1,
        results: [roll],
        sum: total,
        notation,
        check: {
          skillName: req.skillName,
          target: dc,
          roll: total,            // bubble renders `roll/target` directly
          success: passed,
          grade,
          raw: roll,              // original d20 face, for future UI ("d20=14, +3=17")
          modifier,
          modifierExpression: req.modifierDisplay ?? null,
        },
      },
    };
  },

  exportSnapshot(sheet: CharacterData): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (sheet.d20Sheet) {
      out.role = sheet.d20Sheet.role;
      out.level = sheet.d20Sheet.level;
      out.hp = sheet.d20Sheet.hp_current;
      out.hpMax = sheet.d20Sheet.hpMax;
    }
    if (sheet.d20Attributes) {
      out.attributes = sheet.d20Attributes;
    }
    return out;
  },

  describeForAI(): AiRuleHints {
    return {
      rulesPrompt:
        "Room Dice Rules: DnD 5e (d20) " +
        "(roll d20 + player-supplied modifier vs DC. " +
        "Nat 20 = Critical Success (大成功), Nat 1 = Fumble/Critical Failure (大失败). " +
        "Total ≥ DC means success. All character attributes (str/dex/con/int/wis/cha/pb/ac) " +
        "are free-set numbers with NO auto-derivation in this room — players supply modifiers " +
        "explicitly in their .rc commands).",
      sheetToolSchemaFields: {
        d20Attributes: {
          type: "object",
          description:
            "DnD 5e attributes (only when ruleTemplate is 'dnd5e'). " +
            "All 8 keys are free-set numbers: str, dex, con, int, wis, cha (ability scores, " +
            "typically 8–20); pb (proficiency bonus, typically 2–6); ac (armor class, typically 10–20).",
        },
        d20Sheet: {
          type: "object",
          description:
            "DnD 5e role/level/HP meta (only when ruleTemplate is 'dnd5e'). " +
            "Fields: role (string, e.g. '战士'/'Wizard'), level (number), " +
            "hpMax (number), hp_current (number, clamped to hpMax on write).",
        },
      },
    };
  },
};
