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
 *  - Advantage/disadvantage (优势/劣势): `.rc 优势 <name>[±mod] [DC]` rolls
 *    2d20 keeping the highest (劣势 keeps the lowest); DnD 5e never stacks
 *    them, so it is a 3-state toggle, never a count. `.r 优势[±mod] [DC]` is
 *    the nameless shorthand. Crit/fumble grade by the KEPT die's face.
 *  - NO saves, NO class system in v1.
 */

import { rollDie } from "@/lib/commands/dice";
import { D20_DEFAULT_ATTRIBUTES, type D20Attributes } from "./sheet";
import { resolveD20Stat } from "./stats";
import { legacyAttributes, legacyAttributesTouched, legacyBase, legacyCurrent, setResource } from "@/lib/character/legacy";
import type {
  AiRuleHints,
  CheckRequest,
  CheckResult,
  RuleCapabilities,
  RuleModule,
  StatRoute,
  VisualGrade,
} from "../types";

// 8 attribute cards rendered in the character panel grid, in order.
const D20_ATTRIBUTE_KEYS: ReadonlyArray<{ key: string; labelKey: string }> = [
  { key: "str", labelKey: "str" },
  { key: "dex", labelKey: "dex" },
  { key: "con", labelKey: "con" },
  { key: "int", labelKey: "int" },
  { key: "wis", labelKey: "wis" },
  { key: "cha", labelKey: "cha" },
  { key: "pb",  labelKey: "pb"  },
  { key: "ac",  labelKey: "ac"  },
];

/** Modifier formula validator shared by `.rc` and the `.r 优势` shorthand. */
const MOD_FORMULA_RE = /^[+-]([0-9]+([dD][0-9]+)?)([+-][0-9]+([dD][0-9]+)?)*$/;

/** Read a clamped advantage state (1 / −1 / 0) out of untrusted ruleData. */
function readAdvantage(ruleData: Record<string, unknown> | undefined): number {
  const raw = ruleData?.advantage;
  if (raw === 1 || raw === -1) return raw;
  return 0;
}

/**
 * Structured d20 check payload persisted in the dice detail — the chat card
 * renders the die faces (both, for 优势/劣势, marking the kept one), the flat
 * modifier, and the total from this.
 */
export interface D20CheckRoll {
  /** Every d20 face rolled (1 entry normally, 2 with 优势/劣势). */
  rolls: number[];
  /** The face that counts (highest for 优势, lowest for 劣势). */
  kept: number;
  /** 1 = 优势 (keep highest), −1 = 劣势 (keep lowest), 0 = single die. */
  advantage: number;
  /** Evaluated flat modifier added to the kept die. */
  modifier: number;
  /** Human-readable modifier expression (e.g. `"+1+1d6([3])=+4"`), if any. */
  modifierDisplay: string | null;
}

const capabilities: RuleCapabilities = {
  hostLabelKey: "dm",
  playerLabelKey: "adventurer",
  hasSanity: false,
  hasPsychologyRoll: false,
  checkMenuModes: ["check"],
  // No `.sc` — d20 has no sanity. `.st/.rc/.ra/.rh/.rd/.r` all supported.
  supportedCommands: ["help", "st", "rc", "ra", "rch", "rah", "rh", "rd", "r"],
  helpEntryIds: ["st", "rcD20", "rcD20Adv", "rch", "rdr", "rh", "help"],
  defaultRollExpression: "1d20",
  requiresStoredTarget: false,
  quickRolls: [".rd20", ".rc 力量+2 15"],
  // Quick-check panel: roll20-style — pick a stored skill (its stored value
  // seeds the modifier stepper), adjust the flat bonus, optionally type a DC.
  // Attributes stay out: d20 ability *scores* are not modifiers, and this
  // module derives nothing (v1 free-set design).
  quickCheckPanel: {
    skills: true,
    attributes: false,
    nameField: "select",
    modifierField: true,
    dcField: true,
    // 3-state 劣势/无/优势 — never a counter (5e doesn't stack them).
    advantageField: true,
    hiddenToggle: true,
  },
};


export const dnd5eRule: RuleModule = {
  id: "dnd5e",
  labelKey: "ruleTemplateDnd5e",
  hintKey: "ruleTemplateDnd5eHint",
  rcUsageKey: "d20RcUsage",
  capabilities,
  sheet: {
    attributes: D20_ATTRIBUTE_KEYS.map(({ key, labelKey }) => ({
      key, labelKey, min: 0, max: 30,
      default: D20_DEFAULT_ATTRIBUTES[key as keyof D20Attributes],
      // The six abilities are required; proficiency bonus and AC have usable defaults.
      required: key !== "pb" && key !== "ac",
      inStatus: key === "ac",
    })),
    resources: [
      { key: "hp", labelKey: "hp", style: "bar", max: { editable: { default: 10, min: 0, max: 999 } }, initial: "max", required: true },
    ],
    derived: [],
    profile: { roleLevel: true },
    customAttributes: {},
  },

  derive() {
    return {};
  },

  migrateLegacy(legacy) {
    const out = legacyBase(legacy, "dnd5e");
    const defaults = { ...D20_DEFAULT_ATTRIBUTES } as Record<string, number>;
    out.attributes = legacyAttributes(legacy.d20Attributes, defaults);
    const meta = legacy.d20Sheet ?? {};
    if (typeof meta.role === "string" && meta.role) out.role = meta.role;
    if (typeof meta.level === "number") out.level = meta.level;
    const touched = legacyAttributesTouched(legacy.d20Attributes, defaults);
    // Every old sheet was seeded with hpMax 10: count it as set only when it
    // moved off that seed or the player worked the attribute grid. A current
    // with no max at all (an AI write) made itself the max, as `.st hp` did.
    const hasMax = typeof meta.hpMax === "number";
    const orphanCurrent = !hasMax && typeof meta.hp_current === "number";
    const max = hasMax && (meta.hpMax !== 10 || touched) ? meta.hpMax
      : orphanCurrent ? meta.hp_current : undefined;
    setResource(out, "hp", {
      max,
      current: orphanCurrent ? undefined : legacyCurrent(meta.hp_current, meta.hpMax ?? 10, touched),
    });
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
    let trimmed = args.trim();
    if (!trimmed) return null;

    // 0) Optional leading 优势/劣势 token (must be followed by a space so a
    // skill legitimately starting with those characters isn't swallowed).
    let advantage = 0;
    const advMatch = trimmed.match(/^(优势|劣势)\s+(.+)$/);
    if (advMatch) {
      advantage = advMatch[1] === "优势" ? 1 : -1;
      trimmed = advMatch[2].trim();
    }

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
      if (MOD_FORMULA_RE.test(candidate)) {
        modifierExpression = candidate;
        body = modMatch[1].trim();
      }
    }

    let skillName = body.trim();
    if (!skillName) return null;
    if (skillName.length > 50) skillName = skillName.slice(0, 50);

    return {
      skillName,
      explicitTarget,
      modifierExpression,
      ruleData: advantage !== 0 ? { advantage } : undefined,
    };
  },

  /**
   * `.r 优势[±mod] [DC]` / `.r 劣势 +1 15` — nameless shorthand check with
   * advantage/disadvantage (same mechanics as `.rc 优势 <name>`, skillName
   * left empty). Only claims args that START with the 优势/劣势 keyword;
   * everything else stays a plain dice roll.
   */
  parseQuickCheckArgs(args) {
    const m = args.trim().match(/^(优势|劣势)\s*([+-][0-9dD+\-]+)?(?:\s+([0-9]{1,3}))?$/);
    if (!m) return null;
    if (m[2] !== undefined && !MOD_FORMULA_RE.test(m[2])) return null;
    return {
      skillName: "",
      explicitTarget: m[3] !== undefined ? parseInt(m[3], 10) : undefined,
      modifierExpression: m[2],
      ruleData: { advantage: m[1] === "优势" ? 1 : -1 },
    };
  },

  /**
   * Quick-check panel → `.rc [优势/劣势 ]<name>[±mod][ <DC>]`. The modifier IS
   * embedded in the command (unlike COC's server-side lookup) because that is
   * this rule's design: the player-typed flat bonus is the entire modifier
   * story.
   */
  buildCheckCommand(input) {
    const name = input.name.trim();
    if (!name) return null;
    const adv = input.advantage === 1 ? 1 : input.advantage === -1 ? -1 : 0;
    const advPart = adv === 1 ? "优势 " : adv === -1 ? "劣势 " : "";
    const mod = Math.trunc(input.modifier ?? 0);
    const modPart = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "";
    const dc = input.dc !== undefined && Number.isFinite(input.dc)
      ? Math.min(999, Math.max(0, Math.trunc(input.dc)))
      : undefined;
    const dcPart = dc !== undefined ? ` ${dc}` : "";
    const command = `${input.hidden ? ".rch" : ".rc"} ${advPart}${name}${modPart}${dcPart}`;
    const dieStr = adv === 1 ? "2d20kh" : adv === -1 ? "2d20kl" : "1d20";
    const preview = `${dieStr}${modPart} ≥ ${dc ?? 10}`;
    return { command, preview };
  },

  resolveCheck(req: CheckRequest): CheckResult {
    const dc = req.explicitTarget ?? 10;
    const modifier = req.modifierValue ?? 0;
    const advantage = readAdvantage(req.ruleData);

    // 优势/劣势 rolls two d20 and keeps the highest/lowest — never more than
    // two (5e doesn't stack). Crit/fumble grade by the KEPT die's face.
    const rolls = advantage === 0 ? [rollDie(20)] : [rollDie(20), rollDie(20)];
    const kept = advantage >= 0 ? Math.max(...rolls) : Math.min(...rolls);
    const total = kept + modifier;
    const passed = total >= dc;
    const grade: VisualGrade =
      kept === 20 ? "critical"
      : kept === 1 ? "fumble"
      : passed ? "success" : "failure";

    const modStr =
      modifier === 0 ? "" :
      modifier > 0 ? `+${modifier}` : `${modifier}`;
    // kh/kl is the community-standard notation for keep-highest/lowest.
    const dieStr = advantage === 1 ? "2d20kh" : advantage === -1 ? "2d20kl" : "1d20";
    const notation = `${dieStr}${modStr}`;

    return {
      skillName: req.skillName,
      notation,
      rolls,
      total,
      target: dc,
      passed,
      grade,
      detail: {
        // `dice: "d20"` is the discriminator the engine uses to pick the
        // d20 chat message template.
        dice: "d20",
        count: rolls.length,
        results: rolls,
        sum: total,
        notation,
        check: {
          skillName: req.skillName,
          target: dc,
          roll: total,            // bubble renders `roll/target` directly
          success: passed,
          grade,
          raw: kept,              // kept d20 face (back-compat with older UI)
          modifier,
          modifierExpression: req.modifierDisplay ?? null,
          // Structured payload → chat renders the d20 check card (die faces
          // with the kept one marked, modifier, total). Its presence is the
          // data-driven signal for the card layout, so every new dnd5e check
          // gets a card while older messages keep the inline rendering.
          d20: {
            rolls,
            kept,
            advantage,
            modifier,
            modifierDisplay: req.modifierDisplay ?? null,
          } satisfies D20CheckRoll,
        },
      },
    };
  },

  describeForAI(): AiRuleHints {
    return {
      rulesPrompt:
        "Room Dice Rules: DnD 5e (d20) " +
        "(roll d20 + player-supplied modifier vs DC. " +
        "Nat 20 = Critical Success (大成功), Nat 1 = Fumble/Critical Failure (大失败). " +
        "Total ≥ DC means success. Advantage/disadvantage: `.rc 优势 <name>[±mod] [DC]` rolls 2d20 " +
        "keeping the highest (劣势 keeps the lowest; never stacked); `.r 优势[±mod] [DC]` is the " +
        "nameless shorthand. All character attributes (str/dex/con/int/wis/cha/pb/ac) " +
        "are free-set numbers with NO auto-derivation in this room — players supply modifiers " +
        "explicitly in their .rc commands).",
    };
  },
};
