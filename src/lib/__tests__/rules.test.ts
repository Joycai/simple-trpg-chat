import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `rollDie` so we can drive deterministic outcomes. Keep the rest of
// utils intact in case future helpers in the module reach for them.
vi.mock("@/lib/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/utils")>();
  return { ...original, rollDie: vi.fn() };
});

import { rollDie } from "@/lib/utils";
import { basicRule, coc7thRule, dnd5eRule, shouhunRule, triangleRule, getRule, listRules, listRuleIds, DEFAULT_RULE_ID } from "@/lib/rules";
import {
  COC_DEFAULT_ATTRIBUTES,
  D20_DEFAULT_ATTRIBUTES,
  TA_DEFAULT_QUALITIES,
  computeCocDerived,
  computeShDerived,
  shGradeLabel,
  type CharacterData,
} from "@/lib/character-types";

const mockRollDie = rollDie as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRollDie.mockReset();
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("rules/registry", () => {
  it("resolves known ids to their modules", () => {
    expect(getRule("basic")).toBe(basicRule);
    expect(getRule("coc7th")).toBe(coc7thRule);
    expect(getRule("dnd5e")).toBe(dnd5eRule);
  });

  it("falls back to default on null/undefined/unknown ids", () => {
    expect(getRule(null).id).toBe(DEFAULT_RULE_ID);
    expect(getRule(undefined).id).toBe(DEFAULT_RULE_ID);
    expect(getRule("nonexistent").id).toBe(DEFAULT_RULE_ID);
    expect(DEFAULT_RULE_ID).toBe("basic");
  });

  it("listRules / listRuleIds enumerate every built-in", () => {
    const ids = listRuleIds();
    expect(ids).toContain("basic");
    expect(ids).toContain("coc7th");
    expect(ids).toContain("dnd5e");
    expect(listRules().length).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Capabilities — drives every UI / host-action gate in later phases.
// ---------------------------------------------------------------------------

describe("rules/capabilities", () => {
  it("COC enables SAN / psychology / MP and the full check menu", () => {
    const c = coc7thRule.capabilities;
    expect(c.hasSanity).toBe(true);
    expect(c.hasPsychologyRoll).toBe(true);
    expect(c.hasManaPoints).toBe(true);
    expect(c.checkMenuModes).toEqual(["check", "psychology", "sancheck"]);
    expect(c.supportedCommands).toContain("sc");
    expect(c.resourceBars.map(r => r.key)).toEqual(["hp", "san", "mp"]);
    expect(c.attributeKeys.length).toBe(9);
  });

  it("basic disables every rule-specific feature", () => {
    const c = basicRule.capabilities;
    expect(c.hasSanity).toBe(false);
    expect(c.hasPsychologyRoll).toBe(false);
    expect(c.hasManaPoints).toBe(false);
    expect(c.checkMenuModes).toEqual(["check"]);
    expect(c.supportedCommands).not.toContain("sc");
    expect(c.resourceBars).toEqual([]);
    expect(c.attributeKeys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// COC 7th — resolveCheck. Boundaries must match the legacy command engine
// EXACTLY: 1-5 critical, 96-100 fumble, otherwise success/failure by roll≤target.
// The `success` boolean stays tied to (roll <= target), even when grade
// upgrades to critical against a tiny target (preserved quirk #1).
// ---------------------------------------------------------------------------

describe("coc7thRule.resolveCheck", () => {
  const reqAt = (target: number) => ({ skillName: "侦查", target, sheet: null });

  it("treats 1 as critical regardless of target", () => {
    mockRollDie.mockReturnValueOnce(1);
    const r = coc7thRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("critical");
    expect(r.passed).toBe(true);
    expect((r.detail.check as { success: boolean }).success).toBe(true);
  });

  it("treats 5 as critical (upper crit boundary)", () => {
    mockRollDie.mockReturnValueOnce(5);
    expect(coc7thRule.resolveCheck(reqAt(50)).grade).toBe("critical");
  });

  it("treats 6 as ordinary success when below target", () => {
    mockRollDie.mockReturnValueOnce(6);
    expect(coc7thRule.resolveCheck(reqAt(50)).grade).toBe("success");
  });

  it("treats roll == target as success", () => {
    mockRollDie.mockReturnValueOnce(50);
    const r = coc7thRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("success");
    expect(r.passed).toBe(true);
  });

  it("treats roll just above target as failure", () => {
    mockRollDie.mockReturnValueOnce(51);
    const r = coc7thRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("failure");
    expect(r.passed).toBe(false);
  });

  it("treats 95 as ordinary failure when above target (not fumble)", () => {
    mockRollDie.mockReturnValueOnce(95);
    expect(coc7thRule.resolveCheck(reqAt(50)).grade).toBe("failure");
  });

  it("treats 96 as fumble (lower fumble boundary)", () => {
    mockRollDie.mockReturnValueOnce(96);
    const r = coc7thRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("fumble");
    expect(r.passed).toBe(false);
  });

  it("treats 100 as fumble", () => {
    mockRollDie.mockReturnValueOnce(100);
    expect(coc7thRule.resolveCheck(reqAt(50)).grade).toBe("fumble");
  });

  // Preserved quirk: roll=3 vs target=2 → crit grade but success boolean stays false.
  it("preserves the (grade=critical, success=false) edge case when target<5", () => {
    mockRollDie.mockReturnValueOnce(3);
    const r = coc7thRule.resolveCheck(reqAt(2));
    expect(r.grade).toBe("critical");
    expect(r.passed).toBe(false);
    expect((r.detail.check as { success: boolean }).success).toBe(false);
  });

  it("emits diceDetail in the legacy shape (no `command`, no proxy fields)", () => {
    mockRollDie.mockReturnValueOnce(42);
    const r = coc7thRule.resolveCheck({ skillName: "侦查", target: 60, sheet: null });
    expect(r.detail).toEqual({
      dice: "d100",
      count: 1,
      results: [42],
      sum: 42,
      notation: "1d100",
      check: { skillName: "侦查", target: 60, roll: 42, success: true, grade: "success" },
    });
    expect(r.notation).toBe("1d100");
    expect(r.rolls).toEqual([42]);
    expect(r.total).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Basic d100 — same dice shape but NO crit/fumble override.
// ---------------------------------------------------------------------------

describe("basicRule.resolveCheck", () => {
  const reqAt = (target: number) => ({ skillName: "侦查", target, sheet: null });

  it("treats 1 as plain success (no critical grade)", () => {
    mockRollDie.mockReturnValueOnce(1);
    const r = basicRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("success");
    expect(r.passed).toBe(true);
  });

  it("treats 100 as plain failure (no fumble grade)", () => {
    mockRollDie.mockReturnValueOnce(100);
    const r = basicRule.resolveCheck(reqAt(50));
    expect(r.grade).toBe("failure");
    expect(r.passed).toBe(false);
  });

  it("uses ≤ comparison (roll == target succeeds)", () => {
    mockRollDie.mockReturnValueOnce(50);
    expect(basicRule.resolveCheck(reqAt(50)).passed).toBe(true);
  });

  it("emits diceDetail in the same shape as COC (so the renderer doesn't branch)", () => {
    mockRollDie.mockReturnValueOnce(42);
    const r = basicRule.resolveCheck(reqAt(60));
    expect(r.detail).toEqual({
      dice: "d100",
      count: 1,
      results: [42],
      sum: 42,
      notation: "1d100",
      check: { skillName: "侦查", target: 60, roll: 42, success: true, grade: "success" },
    });
  });
});

// ---------------------------------------------------------------------------
// .st routing — must match the legacy command engine's branching.
// ---------------------------------------------------------------------------

describe("routeStat", () => {
  it("COC routes attribute aliases (`力量`, `STR`) to attribute kind", () => {
    expect(coc7thRule.routeStat("力量")).toEqual({ kind: "attribute", key: "str", canonical: "力量" });
    expect(coc7thRule.routeStat("STR")).toEqual({ kind: "attribute", key: "str", canonical: "力量" });
  });

  it("COC routes resource aliases (`san`, `理智值`) to resource kind", () => {
    expect(coc7thRule.routeStat("san")).toEqual({ kind: "resource", key: "san", canonical: "理智值" });
    expect(coc7thRule.routeStat("理智值")).toEqual({ kind: "resource", key: "san", canonical: "理智值" });
  });

  it("COC routes unrecognized names to skill kind", () => {
    expect(coc7thRule.routeStat("侦查")).toEqual({ kind: "skill", canonical: "侦查" });
  });

  it("basic always routes to skill kind, regardless of name", () => {
    expect(basicRule.routeStat("力量")).toEqual({ kind: "skill", canonical: "力量" });
    expect(basicRule.routeStat("侦查")).toEqual({ kind: "skill", canonical: "侦查" });
    expect(basicRule.routeStat("san")).toEqual({ kind: "skill", canonical: "san" });
  });
});

// ---------------------------------------------------------------------------
// canonicalStatName
// ---------------------------------------------------------------------------

describe("canonicalStatName", () => {
  it("COC normalizes aliases to Chinese canonical (san → 理智值)", () => {
    expect(coc7thRule.canonicalStatName("san")).toBe("理智值");
    expect(coc7thRule.canonicalStatName("STR")).toBe("力量");
  });

  it("COC leaves unrecognized names alone", () => {
    expect(coc7thRule.canonicalStatName("侦查")).toBe("侦查");
  });

  it("basic is identity", () => {
    expect(basicRule.canonicalStatName("san")).toBe("san");
    expect(basicRule.canonicalStatName("侦查")).toBe("侦查");
  });
});

// ---------------------------------------------------------------------------
// lookupFallback — the COC `.rc` retry path when room_skills misses.
// ---------------------------------------------------------------------------

describe("lookupFallback", () => {
  const cocSheet = (): CharacterData => ({
    ruleTemplate: "coc7th",
    cocAttributes: { ...COC_DEFAULT_ATTRIBUTES, str: 70 },
    cocDerived: { ...computeCocDerived({ ...COC_DEFAULT_ATTRIBUTES, str: 70 }), san_current: 42 },
  });

  it("COC: attribute alias resolves through the sheet", () => {
    expect(coc7thRule.lookupFallback("力量", cocSheet())).toEqual({ name: "力量", value: 70 });
  });

  it("COC: resource alias resolves to current value (san_current)", () => {
    expect(coc7thRule.lookupFallback("san", cocSheet())).toEqual({ name: "理智值", value: 42 });
  });

  it("COC: unrecognized name returns null (falls through to STAT_NOT_SET)", () => {
    expect(coc7thRule.lookupFallback("侦查", cocSheet())).toBeNull();
  });

  it("COC: null sheet returns null", () => {
    expect(coc7thRule.lookupFallback("力量", null)).toBeNull();
  });

  it("basic: always null", () => {
    expect(basicRule.lookupFallback("力量", cocSheet())).toBeNull();
    expect(basicRule.lookupFallback("san", null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// initCharacter / computeDerived
// ---------------------------------------------------------------------------

describe("initCharacter", () => {
  it("COC seeds 9 attributes + computed derived (HP/SAN/MP)", () => {
    const c = coc7thRule.initCharacter();
    expect(c.ruleTemplate).toBe("coc7th");
    expect(c.cocAttributes).toEqual(COC_DEFAULT_ATTRIBUTES);
    expect(c.cocDerived).toBeDefined();
    expect(c.cocDerived?.hpMax).toBeGreaterThan(0);
    expect(c.cocDerived?.sanMax).toBe(99); // COC_MAX_SANITY
  });

  it("basic returns a bare ruleTemplate marker", () => {
    expect(basicRule.initCharacter()).toEqual({ ruleTemplate: "basic" });
  });
});

describe("computeDerived", () => {
  it("COC re-clamps player-set hp_current after an attribute edit lowers hpMax", () => {
    // Start with default sheet (CON=50, SIZ=50 → hpMax = 10), player has hp_current=8
    const sheet: CharacterData = {
      ruleTemplate: "coc7th",
      cocAttributes: { ...COC_DEFAULT_ATTRIBUTES },
      cocDerived: { ...computeCocDerived(COC_DEFAULT_ATTRIBUTES), hp_current: 8 },
    };
    // Drop CON so the new hpMax is below 8
    sheet.cocAttributes = { ...sheet.cocAttributes!, con: 10 };
    const updated = coc7thRule.computeDerived(sheet);
    expect(updated.cocDerived?.hpMax).toBeLessThan(8);
    expect(updated.cocDerived?.hp_current).toBe(updated.cocDerived?.hpMax);
  });

  it("COC preserves san_current as both .san and .san_current after recompute", () => {
    const sheet: CharacterData = {
      ruleTemplate: "coc7th",
      cocAttributes: { ...COC_DEFAULT_ATTRIBUTES },
      cocDerived: { ...computeCocDerived(COC_DEFAULT_ATTRIBUTES), san_current: 42 },
    };
    const updated = coc7thRule.computeDerived(sheet);
    expect(updated.cocDerived?.san).toBe(42);
    expect(updated.cocDerived?.san_current).toBe(42);
  });

  it("basic is an identity (no derived state to compute)", () => {
    const sheet: CharacterData = { ruleTemplate: "basic", customAttributes: [{ name: "x", value: 1 }] };
    expect(basicRule.computeDerived(sheet)).toBe(sheet);
  });
});

// ---------------------------------------------------------------------------
// exportSnapshot
// ---------------------------------------------------------------------------

describe("exportSnapshot", () => {
  it("COC carries hp/hpMax/san/mp + attributes (matches legacy export.ts)", () => {
    const sheet = coc7thRule.initCharacter();
    const snap = coc7thRule.exportSnapshot(sheet);
    expect(snap).toHaveProperty("hp");
    expect(snap).toHaveProperty("hpMax");
    expect(snap).toHaveProperty("san");
    expect(snap).toHaveProperty("mp");
    expect(snap.attributes).toEqual(sheet.cocAttributes);
  });

  it("basic returns an empty snapshot (no rule-specific fields to surface)", () => {
    expect(basicRule.exportSnapshot({ ruleTemplate: "basic" })).toEqual({});
  });
});

// ===========================================================================
// DnD 5e (d20) — capabilities, parseRcArgs, resolveCheck, routeStat,
// applyStatWrite, exportSnapshot.
// ===========================================================================

describe("dnd5eRule/capabilities", () => {
  it("declares 8 attribute keys, HP-only resource, no SAN/MP/psychology", () => {
    const c = dnd5eRule.capabilities;
    expect(c.hasSanity).toBe(false);
    expect(c.hasPsychologyRoll).toBe(false);
    expect(c.hasManaPoints).toBe(false);
    expect(c.checkMenuModes).toEqual(["check"]);
    expect(c.supportedCommands).not.toContain("sc");
    expect(c.resourceBars.map(r => r.key)).toEqual(["hp"]);
    expect(c.attributeKeys.map(a => a.key)).toEqual([
      "str", "dex", "con", "int", "wis", "cha", "pb", "ac",
    ]);
    expect(c.defaultRollExpression).toBe("1d20");
    expect(c.requiresStoredTarget).toBe(false);
    expect(c.hasRoleLevel).toBe(true);
  });
});

describe("dnd5eRule.parseRcArgs", () => {
  // Plan §3.4 table.
  it.each([
    ["str",                 { skillName: "str" }],
    ["str+3",               { skillName: "str", modifierExpression: "+3" }],
    ["str 15",              { skillName: "str", explicitTarget: 15 }],
    ["str+3 15",            { skillName: "str", modifierExpression: "+3", explicitTarget: 15 }],
    ["力量-2 12",           { skillName: "力量", modifierExpression: "-2", explicitTarget: 12 }],
    ["athletics+1+1d6 12",  { skillName: "athletics", modifierExpression: "+1+1d6", explicitTarget: 12 }],
    ["athletics+1+1d6",     { skillName: "athletics", modifierExpression: "+1+1d6" }],
    ["athletics 12",        { skillName: "athletics", explicitTarget: 12 }],
    // Space before DC is required — "str15" without space is name only.
    ["str15",               { skillName: "str15" }],
  ])("parses %o", (input, expected) => {
    const result = dnd5eRule.parseRcArgs(input);
    // Strip undefined keys for stable comparison.
    const clean = Object.fromEntries(Object.entries(result!).filter(([, v]) => v !== undefined));
    expect(clean).toEqual(expected);
  });

  it("returns null for empty input", () => {
    expect(dnd5eRule.parseRcArgs("")).toBeNull();
    expect(dnd5eRule.parseRcArgs("   ")).toBeNull();
  });
});

describe("dnd5eRule.resolveCheck", () => {
  it("default DC=10 with no explicit target and no modifier", () => {
    mockRollDie.mockReturnValueOnce(11);
    const r = dnd5eRule.resolveCheck({ skillName: "str", target: 0, sheet: null });
    expect(r.target).toBe(10);
    expect(r.rolls).toEqual([11]);
    expect(r.total).toBe(11);
    expect(r.passed).toBe(true);
    expect(r.grade).toBe("success");
    expect(r.notation).toBe("1d20");
  });

  it("modifier added to roll; total ≥ DC → success at boundary", () => {
    mockRollDie.mockReturnValueOnce(12);
    const r = dnd5eRule.resolveCheck({
      skillName: "str", target: 0, sheet: null,
      explicitTarget: 15, modifierValue: 3, modifierDisplay: "+3",
    });
    expect(r.total).toBe(15);
    expect(r.target).toBe(15);
    expect(r.passed).toBe(true);
    expect(r.grade).toBe("success");
    expect(r.notation).toBe("1d20+3");
  });

  it("nat 20 → grade=critical regardless of DC", () => {
    mockRollDie.mockReturnValueOnce(20);
    const r = dnd5eRule.resolveCheck({
      skillName: "str", target: 0, sheet: null,
      explicitTarget: 99, modifierValue: 0,
    });
    expect(r.grade).toBe("critical");
    // total < DC, so passed=false even when grade=critical (visual marker only).
    expect(r.passed).toBe(false);
  });

  it("nat 1 → grade=fumble regardless of bonuses", () => {
    mockRollDie.mockReturnValueOnce(1);
    const r = dnd5eRule.resolveCheck({
      skillName: "str", target: 0, sheet: null,
      explicitTarget: 5, modifierValue: 10,
    });
    expect(r.grade).toBe("fumble");
    // d20=1 + 10 = 11 ≥ 5 → passed=true. Grade is purely visual.
    expect(r.passed).toBe(true);
  });

  it("negative modifier renders without double sign in notation", () => {
    mockRollDie.mockReturnValueOnce(10);
    const r = dnd5eRule.resolveCheck({
      skillName: "force", target: 0, sheet: null,
      explicitTarget: 10, modifierValue: -2,
    });
    expect(r.notation).toBe("1d20-2");
    expect(r.total).toBe(8);
  });

  it("detail carries raw d20 face + modifier for future UI", () => {
    mockRollDie.mockReturnValueOnce(14);
    const r = dnd5eRule.resolveCheck({
      skillName: "perception", target: 0, sheet: null,
      explicitTarget: 12, modifierValue: 4, modifierDisplay: "+4",
    });
    const check = (r.detail as { check: Record<string, unknown> }).check;
    expect(check.raw).toBe(14);
    expect(check.modifier).toBe(4);
    expect(check.modifierExpression).toBe("+4");
    expect((r.detail as Record<string, unknown>).dice).toBe("d20");
  });
});

describe("dnd5eRule.routeStat", () => {
  it.each([
    ["str", "attribute", "str"],
    ["DEX", "attribute", "dex"],
    ["力量", "attribute", "str"],
    ["wisdom", "attribute", "wis"],
    ["cha", "attribute", "cha"],
    ["pb", "attribute", "pb"],
    ["熟练", "attribute", "pb"],
    ["ac", "attribute", "ac"],
    ["HP", "resource", "hp"],
    ["生命", "resource", "hp"],
    ["athletics", "skill", undefined],
    ["sneak attack damage", "skill", undefined],
  ])("routes %s to %s", (name, kind, key) => {
    const r = dnd5eRule.routeStat(name);
    expect(r.kind).toBe(kind);
    if (kind !== "skill") {
      expect((r as { key: string }).key).toBe(key);
    }
  });
});

describe("dnd5eRule.lookupFallback", () => {
  it("always returns null (modifier sourcing is explicit in .rc formula)", () => {
    expect(dnd5eRule.lookupFallback("str", null)).toBeNull();
    expect(dnd5eRule.lookupFallback("str", {
      ruleTemplate: "dnd5e",
      d20Attributes: { ...D20_DEFAULT_ATTRIBUTES, str: 16 },
    })).toBeNull();
  });
});

describe("dnd5eRule.computeDerived", () => {
  it("identity for non-d20 sheets", () => {
    const coc: CharacterData = { ruleTemplate: "coc7th" };
    expect(dnd5eRule.computeDerived(coc)).toBe(coc);
  });

  it("clamps hp_current to hpMax", () => {
    const sheet: CharacterData = {
      ruleTemplate: "dnd5e",
      d20Sheet: { hpMax: 20, hp_current: 999 },
    };
    const out = dnd5eRule.computeDerived(sheet);
    expect(out.d20Sheet?.hp_current).toBe(20);
  });

  it("does NOT auto-compute pb / ac / ability mods (v1: free-set)", () => {
    const sheet: CharacterData = {
      ruleTemplate: "dnd5e",
      d20Attributes: { ...D20_DEFAULT_ATTRIBUTES, str: 18, dex: 16 },
    };
    const out = dnd5eRule.computeDerived(sheet);
    // No mods/derived map gets injected — attributes are returned untouched.
    expect(out.d20Attributes).toEqual({ ...D20_DEFAULT_ATTRIBUTES, str: 18, dex: 16 });
  });
});

describe("dnd5eRule.applyStatWrite", () => {
  it("attribute write lands in d20Attributes[key]", () => {
    const sheet: CharacterData = {
      ruleTemplate: "dnd5e",
      d20Attributes: { ...D20_DEFAULT_ATTRIBUTES },
    };
    const { sheet: out, finalValue } = dnd5eRule.applyStatWrite(
      sheet, { kind: "attribute", key: "str", canonical: "力量" }, 16
    );
    expect(out.d20Attributes?.str).toBe(16);
    expect(finalValue).toBe(16);
  });

  it("HP write clamps to hpMax", () => {
    const sheet: CharacterData = {
      ruleTemplate: "dnd5e",
      d20Sheet: { hpMax: 12 },
    };
    const { sheet: out, finalValue } = dnd5eRule.applyStatWrite(
      sheet, { kind: "resource", key: "hp", canonical: "生命值" }, 50
    );
    expect(out.d20Sheet?.hp_current).toBe(12);
    expect(finalValue).toBe(12);
  });

  it("HP write without hpMax sets both current AND max", () => {
    const sheet: CharacterData = { ruleTemplate: "dnd5e" };
    const { sheet: out, finalValue } = dnd5eRule.applyStatWrite(
      sheet, { kind: "resource", key: "hp", canonical: "生命值" }, 25
    );
    expect(out.d20Sheet?.hp_current).toBe(25);
    expect(out.d20Sheet?.hpMax).toBe(25);
    expect(finalValue).toBe(25);
  });
});

describe("dnd5eRule.exportSnapshot", () => {
  it("includes role/level/hp/attributes when present", () => {
    const sheet: CharacterData = {
      ruleTemplate: "dnd5e",
      d20Attributes: { ...D20_DEFAULT_ATTRIBUTES, str: 14 },
      d20Sheet: { role: "战士", level: 3, hp_current: 22, hpMax: 28 },
    };
    expect(dnd5eRule.exportSnapshot(sheet)).toEqual({
      role: "战士",
      level: 3,
      hp: 22,
      hpMax: 28,
      attributes: { ...D20_DEFAULT_ATTRIBUTES, str: 14 },
    });
  });
});

// ===========================================================================
// Isolation invariant — COC/basic must remain byte-for-byte compatible
// with pre-d20 behavior. These tests directly assert that the new
// CheckRequest noise fields and the new methods do not perturb COC.
// ===========================================================================

describe("rules/isolation — COC/basic must not regress", () => {
  it("COC keeps defaultRollExpression=1d100, requiresStoredTarget=true", () => {
    expect(coc7thRule.capabilities.defaultRollExpression).toBe("1d100");
    expect(coc7thRule.capabilities.requiresStoredTarget).toBe(true);
    expect(coc7thRule.capabilities.hasRoleLevel).toBe(false);
  });

  it("basic keeps defaultRollExpression=1d100, requiresStoredTarget=true", () => {
    expect(basicRule.capabilities.defaultRollExpression).toBe("1d100");
    expect(basicRule.capabilities.requiresStoredTarget).toBe(true);
    expect(basicRule.capabilities.hasRoleLevel).toBe(false);
  });

  it("COC parseRcArgs matches legacy regex (no-space trailing int OK)", () => {
    // Mirrors `.rc 侦查50` (no space) which the old engine accepted.
    expect(coc7thRule.parseRcArgs("侦查50")).toEqual({ skillName: "侦查", explicitTarget: 50 });
    expect(coc7thRule.parseRcArgs("力量 60")).toEqual({ skillName: "力量", explicitTarget: 60 });
    expect(coc7thRule.parseRcArgs("侦查")).toEqual({ skillName: "侦查" });
    expect(coc7thRule.parseRcArgs("")).toBeNull();
  });

  it("basic parseRcArgs matches the same legacy regex", () => {
    expect(basicRule.parseRcArgs("Spot50")).toEqual({ skillName: "Spot", explicitTarget: 50 });
    expect(basicRule.parseRcArgs("Spot 60")).toEqual({ skillName: "Spot", explicitTarget: 60 });
    expect(basicRule.parseRcArgs("Spot")).toEqual({ skillName: "Spot" });
  });

  it("COC resolveCheck ignores d20-only noise fields (modifierValue/explicitTarget)", () => {
    mockRollDie.mockReturnValueOnce(45);
    const baseline = coc7thRule.resolveCheck({ skillName: "侦查", target: 60, sheet: null });
    mockRollDie.mockReturnValueOnce(45);
    const withNoise = coc7thRule.resolveCheck({
      skillName: "侦查", target: 60, sheet: null,
      // All the d20 noise fields:
      explicitTarget: 999, storedValue: 42,
      modifierValue: 999, modifierDisplay: "+999",
    });
    expect(withNoise).toEqual(baseline);
  });

  it("COC applyStatWrite (attribute) matches the legacy syncCharacterStat shape", () => {
    const sheet: CharacterData = {
      ruleTemplate: "coc7th",
      cocAttributes: { ...COC_DEFAULT_ATTRIBUTES, con: 60, siz: 60 },
      cocDerived: computeCocDerived({ ...COC_DEFAULT_ATTRIBUTES, con: 60, siz: 60 }),
    };
    const { sheet: out, finalValue } = coc7thRule.applyStatWrite(
      sheet, { kind: "attribute", key: "str", canonical: "力量" }, 70
    );
    expect(out.cocAttributes?.str).toBe(70);
    // hpMax = (con+siz)/10 = 12; HP_current unchanged because not previously set.
    expect(out.cocDerived?.hpMax).toBe(12);
    expect(finalValue).toBe(70);
  });

  it("COC applyStatWrite (resource san) caps at 99 and writes both base+current", () => {
    const sheet: CharacterData = {
      ruleTemplate: "coc7th",
      cocAttributes: { ...COC_DEFAULT_ATTRIBUTES },
      cocDerived: computeCocDerived(COC_DEFAULT_ATTRIBUTES),
    };
    const { sheet: out, finalValue } = coc7thRule.applyStatWrite(
      sheet, { kind: "resource", key: "san", canonical: "理智值" }, 200
    );
    expect(finalValue).toBe(99);
    const d = out.cocDerived as unknown as Record<string, number | undefined>;
    expect(d.san).toBe(99);
    expect(d.san_current).toBe(99);
    expect(d.sanMax).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Triangle Agency — 6d4 count-3s system. No .rc checks in v1; qualifications
// are free-set attributes and commendations/reprimands are unbounded counters.
// ---------------------------------------------------------------------------

const TA_QUALITY_KEYS = [
  "attentiveness", "duplicity", "dynamism", "empathy", "initiative",
  "persistence", "presence", "professionalism", "subtlety",
] as const;

describe("triangleRule/capabilities", () => {
  it("is registered and enumerable", () => {
    expect(getRule("triangle")).toBe(triangleRule);
    expect(listRuleIds()).toContain("triangle");
  });

  it("declares the 6d4 pool + highlight face 3", () => {
    const c = triangleRule.capabilities;
    expect(c.defaultRollExpression).toBe("6d4");
    expect(c.highlightDieFace).toBe(3);
    expect(c.quickRolls).toContain(".r 6d4");
  });

  it("hides every check surface and sanity feature", () => {
    const c = triangleRule.capabilities;
    expect(c.hasSanity).toBe(false);
    expect(c.hasPsychologyRoll).toBe(false);
    expect(c.hasManaPoints).toBe(false);
    expect(c.checkMenuModes).toEqual([]);
    expect(c.supportedCommands).not.toContain("rc");
    expect(c.supportedCommands).not.toContain("sc");
  });

  it("declares 9 qualifications + 2 counter-style resources", () => {
    const c = triangleRule.capabilities;
    expect(c.attributeKeys.map(a => a.key)).toEqual([...TA_QUALITY_KEYS]);
    expect(c.resourceBars.map(r => r.key)).toEqual(["commendations", "reprimands"]);
    expect(c.resourceBars.every(r => r.style === "counter")).toBe(true);
  });
});

describe("triangleRule.initCharacter", () => {
  it("seeds 9 qualifications at 0 and both counters at 0", () => {
    const sheet = triangleRule.initCharacter();
    expect(sheet.ruleTemplate).toBe("triangle");
    TA_QUALITY_KEYS.forEach(k => {
      expect(sheet.taQualities?.[k]).toBe(0);
    });
    expect(sheet.taSheet).toEqual({ commendations: 0, reprimands: 0 });
  });
});

describe("triangleRule.routeStat", () => {
  it("routes all 9 qualifications (zh + en aliases) to attribute", () => {
    const zhAliases: Record<string, string> = {
      专注: "attentiveness", 欺瞒: "duplicity", 活力: "dynamism",
      共情: "empathy", 主动: "initiative", 坚持: "persistence",
      存在感: "presence", 专业: "professionalism", 隐微: "subtlety",
    };
    for (const [zh, key] of Object.entries(zhAliases)) {
      expect(triangleRule.routeStat(zh)).toMatchObject({ kind: "attribute", key });
      expect(triangleRule.routeStat(key)).toMatchObject({ kind: "attribute", key });
    }
  });

  it("routes 嘉奖/处分 (and en aliases) to resource", () => {
    expect(triangleRule.routeStat("嘉奖")).toMatchObject({ kind: "resource", key: "commendations", canonical: "嘉奖" });
    expect(triangleRule.routeStat("commendation")).toMatchObject({ kind: "resource", key: "commendations" });
    expect(triangleRule.routeStat("处分")).toMatchObject({ kind: "resource", key: "reprimands", canonical: "处分" });
    expect(triangleRule.routeStat("reprimands")).toMatchObject({ kind: "resource", key: "reprimands" });
  });

  it("falls through to skill for anything else", () => {
    expect(triangleRule.routeStat("侦查")).toEqual({ kind: "skill", canonical: "侦查" });
  });

  it("canonicalStatName normalizes aliases and passes through skills", () => {
    expect(triangleRule.canonicalStatName("attentiveness")).toBe("专注");
    expect(triangleRule.canonicalStatName("嘉奖")).toBe("嘉奖");
    expect(triangleRule.canonicalStatName("侦查")).toBe("侦查");
  });
});

describe("triangleRule.applyStatWrite", () => {
  const freshSheet = (): CharacterData => triangleRule.initCharacter();

  it("writes a qualification without touching the others", () => {
    const { sheet, finalValue } = triangleRule.applyStatWrite(
      freshSheet(), { kind: "attribute", key: "empathy", canonical: "共情" }, 3
    );
    expect(finalValue).toBe(3);
    expect(sheet.taQualities?.empathy).toBe(3);
    expect(sheet.taQualities?.attentiveness).toBe(0);
  });

  it("counter writes are NOT clamped to any max (999 stays 999)", () => {
    const { sheet, finalValue } = triangleRule.applyStatWrite(
      freshSheet(), { kind: "resource", key: "commendations", canonical: "嘉奖" }, 999
    );
    expect(finalValue).toBe(999);
    expect(sheet.taSheet?.commendations).toBe(999);
  });

  it("counter writes floor at 0", () => {
    const { sheet, finalValue } = triangleRule.applyStatWrite(
      freshSheet(), { kind: "resource", key: "reprimands", canonical: "处分" }, -5
    );
    expect(finalValue).toBe(0);
    expect(sheet.taSheet?.reprimands).toBe(0);
  });
});

describe("triangleRule — no .rc surface", () => {
  it("parseRcArgs always returns null", () => {
    expect(triangleRule.parseRcArgs("专注")).toBeNull();
    expect(triangleRule.parseRcArgs("专注 50")).toBeNull();
    expect(triangleRule.parseRcArgs("")).toBeNull();
  });

  it("resolveCheck throws (unreachable guard)", () => {
    expect(() =>
      triangleRule.resolveCheck({ skillName: "专注", target: 0, sheet: null })
    ).toThrow();
  });

  it("lookupFallback returns null", () => {
    expect(triangleRule.lookupFallback("专注", triangleRule.initCharacter())).toBeNull();
  });

  it("rcUsageKey points at the triangle-specific message", () => {
    expect(triangleRule.rcUsageKey).toBe("taRcNotSupported");
  });
});

describe("triangleRule.computeDerived / exportSnapshot", () => {
  it("computeDerived is identity", () => {
    const sheet = triangleRule.initCharacter();
    expect(triangleRule.computeDerived(sheet)).toBe(sheet);
  });

  it("exportSnapshot carries counters + qualities", () => {
    const sheet: CharacterData = {
      ruleTemplate: "triangle",
      taQualities: { ...TA_DEFAULT_QUALITIES, empathy: 3 },
      taSheet: { commendations: 5, reprimands: 2 },
    };
    expect(triangleRule.exportSnapshot(sheet)).toEqual({
      commendations: 5,
      reprimands: 2,
      qualities: { ...TA_DEFAULT_QUALITIES, empathy: 3 },
    });
  });
});

describe("rules/quickRolls — every rule contributes its chips", () => {
  it("coc7th keeps the legacy three chips", () => {
    expect(coc7thRule.capabilities.quickRolls).toEqual([".rc 侦查", ".sc 1/1d6", ".rd100"]);
  });

  it("basic drops the COC-only .sc chip", () => {
    expect(basicRule.capabilities.quickRolls).toEqual([".rc 侦查", ".rd100"]);
  });

  it("dnd5e advertises d20-flavored chips", () => {
    expect(dnd5eRule.capabilities.quickRolls).toEqual([".rd20", ".rc 力量+2 15"]);
  });

  it("shouhun teaches its own check syntax (named / with 时髦骰 / .r shorthand)", () => {
    expect(shouhunRule.capabilities.quickRolls).toEqual([
      ".rc 侦查+2 10", ".rc 侦查+2+1 12", ".r+2+1 12",
    ]);
  });

  it("only triangle sets highlightDieFace", () => {
    expect(basicRule.capabilities.highlightDieFace).toBeUndefined();
    expect(coc7thRule.capabilities.highlightDieFace).toBeUndefined();
    expect(dnd5eRule.capabilities.highlightDieFace).toBeUndefined();
  });
});

// ===========================================================================
// 狩魂者 (shouhun) — 1d20 + xd4 ± yd6 vs DC, tiered success levels.
// ===========================================================================

describe("shouhunRule/capabilities", () => {
  it("is registered and enumerable", () => {
    expect(getRule("shouhun")).toBe(shouhunRule);
    expect(listRuleIds()).toContain("shouhun");
  });

  it("declares 3 attributes, hp+mana bars, no SAN surface, d20 default roll", () => {
    const c = shouhunRule.capabilities;
    expect(c.hasSanity).toBe(false);
    expect(c.hasPsychologyRoll).toBe(false);
    expect(c.hasManaPoints).toBe(false);
    expect(c.checkMenuModes).toEqual(["check"]);
    expect(c.supportedCommands).not.toContain("sc");
    expect(c.resourceBars.map(r => r.key)).toEqual(["hp", "mana"]);
    expect(c.attributeKeys.map(a => a.key)).toEqual(["phy", "wis", "soul"]);
    expect(c.defaultRollExpression).toBe("1d20");
    expect(c.requiresStoredTarget).toBe(false);
    expect(c.hasRoleLevel).toBe(false);
  });

  it("declares the specialized host-check-request flow (DC + 时髦骰 + responder 加骰)", () => {
    expect(shouhunRule.capabilities.checkRequestOptions).toEqual({
      dcField: true,
      styleDiceField: { min: -3, max: 3 },
      skillNameOptional: true,
      responderBonusDice: { max: 20 },
    });
    // Other rules keep the legacy skill-name + diceType flow.
    expect(coc7thRule.capabilities.checkRequestOptions).toBeUndefined();
    expect(dnd5eRule.capabilities.checkRequestOptions).toBeUndefined();
    expect(basicRule.capabilities.checkRequestOptions).toBeUndefined();
  });
});

describe("shouhun derived math (computeShDerived)", () => {
  // Strength tier examples straight from docs/ext-rules/shouhun.md.
  it.each([
    [9, 4], [4, 2], [5, 2], [1, 0], [6, 3], [7, 3],
  ])("attribute %i → strength %i", (attr, strength) => {
    expect(computeShDerived({ phy: attr, wis: 1, soul: 1 }).phyStrength).toBe(strength);
  });

  it("HP = 5 + 体魄强度; mana = 5 + 智慧×2 + 心魂; 灵识 = sum", () => {
    const d = computeShDerived({ phy: 9, wis: 6, soul: 7 });
    expect(d.hpMax).toBe(9);        // 5 + 4
    expect(d.manaMax).toBe(24);     // 5 + 12 + 7
    expect(d.spiritSense).toBe(22);
  });

  it("grade labels cover E..SSS+", () => {
    expect(shGradeLabel(1)).toBe("E");
    expect(shGradeLabel(5)).toBe("A");
    expect(shGradeLabel(9)).toBe("SSS+");
  });
});

describe("shouhunRule.initCharacter", () => {
  it("seeds 3/3/3 attributes (灵识 9) with full derived resources", () => {
    const sheet = shouhunRule.initCharacter();
    expect(sheet.ruleTemplate).toBe("shouhun");
    expect(sheet.shAttributes).toEqual({ phy: 3, wis: 3, soul: 3 });
    expect(sheet.shSheet).toEqual({ hp_current: 6, mana_current: 14 });
  });
});

describe("shouhunRule.parseRcArgs", () => {
  it.each([
    ["侦查",         { skillName: "侦查" }],
    ["侦查 12",      { skillName: "侦查", explicitTarget: 12 }],
    ["侦查+3",       { skillName: "侦查", modifierExpression: "+3d4" }],
    ["侦查+3 12",    { skillName: "侦查", modifierExpression: "+3d4", explicitTarget: 12 }],
    ["侦查+3+2 12",  { skillName: "侦查", modifierExpression: "+3d4+2d6", explicitTarget: 12 }],
    ["侦查+3-2",     { skillName: "侦查", modifierExpression: "+3d4-2d6" }],
    ["侦查-2",       { skillName: "侦查", modifierExpression: "-2d6" }],
    ["侦查+0+2",     { skillName: "侦查", modifierExpression: "+2d6" }],
    ["scout+2 10",   { skillName: "scout", modifierExpression: "+2d4", explicitTarget: 10 }],
    // Space before DC is required — "侦查12" reads as a name.
    ["侦查12",       { skillName: "侦查12" }],
  ])("parses %o", (input, expected) => {
    const result = shouhunRule.parseRcArgs(input);
    const clean = Object.fromEntries(Object.entries(result!).filter(([, v]) => v !== undefined));
    expect(clean).toEqual(expected);
  });

  it("rejects out-of-range dice counts and empty input", () => {
    expect(shouhunRule.parseRcArgs("")).toBeNull();
    expect(shouhunRule.parseRcArgs("   ")).toBeNull();
    expect(shouhunRule.parseRcArgs("侦查+21")).toBeNull();      // x > 20
    expect(shouhunRule.parseRcArgs("侦查+3+4")).toBeNull();     // |y| > 3
    expect(shouhunRule.parseRcArgs("侦查+3-4")).toBeNull();     // |y| > 3
    expect(shouhunRule.parseRcArgs("侦查-2-1")).toBeNull();     // negative x is ambiguous
  });
});

describe("shouhunRule.resolveCheck", () => {
  it("default DC=10; success level 1 at the boundary", () => {
    mockRollDie.mockReturnValueOnce(10);
    const r = shouhunRule.resolveCheck({ skillName: "侦查", target: 0, sheet: null });
    expect(r.target).toBe(10);
    expect(r.total).toBe(10);
    expect(r.passed).toBe(true);
    expect(r.grade).toBe("success");
    expect((r.detail as { check: { successLevel: number } }).check.successLevel).toBe(1);
  });

  it("rulebook example: total 26 vs DC 10 → success level 4", () => {
    mockRollDie.mockReturnValueOnce(11);
    const r = shouhunRule.resolveCheck({
      skillName: "侦查", target: 0, sheet: null, modifierValue: 15, modifierDisplay: "+3d4([4, 5, 6])=+15",
    });
    expect(r.total).toBe(26);
    expect((r.detail as { check: { successLevel: number } }).check.successLevel).toBe(4);
  });

  it("rulebook example: total 21 vs DC 20 → success level 1", () => {
    mockRollDie.mockReturnValueOnce(21 - 5);
    const r = shouhunRule.resolveCheck({
      skillName: "侦查", target: 0, sheet: null, explicitTarget: 20, modifierValue: 5,
    });
    expect(r.total).toBe(21);
    expect(r.passed).toBe(true);
    expect((r.detail as { check: { successLevel: number } }).check.successLevel).toBe(1);
  });

  it("failure carries no success level; grade stays failure", () => {
    mockRollDie.mockReturnValueOnce(9);
    const r = shouhunRule.resolveCheck({ skillName: "侦查", target: 0, sheet: null });
    expect(r.passed).toBe(false);
    expect(r.grade).toBe("failure");
    expect((r.detail as { check: { successLevel: number | null } }).check.successLevel).toBeNull();
  });

  it("no crit/fumble: nat 20 and nat 1 stay success/failure", () => {
    mockRollDie.mockReturnValueOnce(20);
    expect(shouhunRule.resolveCheck({ skillName: "a", target: 0, sheet: null }).grade).toBe("success");
    mockRollDie.mockReturnValueOnce(1);
    expect(shouhunRule.resolveCheck({ skillName: "a", target: 0, sheet: null }).grade).toBe("failure");
  });

  it("negative style dice subtract; detail reuses the d20 template", () => {
    mockRollDie.mockReturnValueOnce(15);
    const r = shouhunRule.resolveCheck({
      skillName: "侦查", target: 0, sheet: null, modifierValue: -4, modifierDisplay: "-2d6([1, 3])=-4",
    });
    expect(r.total).toBe(11);
    expect(r.notation).toBe("1d20-4");
    expect((r.detail as Record<string, unknown>).dice).toBe("d20");
    const check = (r.detail as { check: Record<string, unknown> }).check;
    expect(check.raw).toBe(15);
    expect(check.modifier).toBe(-4);
  });
});

describe("shouhunRule.routeStat", () => {
  it.each([
    ["体魄", "attribute", "phy"],
    ["PHY", "attribute", "phy"],
    ["智慧", "attribute", "wis"],
    ["wisdom", "attribute", "wis"],
    ["心魂", "attribute", "soul"],
    ["soul", "attribute", "soul"],
    ["生命值", "resource", "hp"],
    ["HP", "resource", "hp"],
    ["灵力", "resource", "mana"],
    ["mp", "resource", "mana"],
    ["侦查", "skill", undefined],
  ])("routes %s to %s", (name, kind, key) => {
    const r = shouhunRule.routeStat(name);
    expect(r.kind).toBe(kind);
    if (kind !== "skill") {
      expect((r as { key: string }).key).toBe(key);
    }
  });

  it("canonicalStatName normalizes aliases, passes skills through", () => {
    expect(shouhunRule.canonicalStatName("phy")).toBe("体魄");
    expect(shouhunRule.canonicalStatName("mp")).toBe("灵力值");
    expect(shouhunRule.canonicalStatName("侦查")).toBe("侦查");
  });
});

describe("shouhunRule.lookupFallback", () => {
  it("always returns null (x/y are player-typed, no auto lookup)", () => {
    expect(shouhunRule.lookupFallback("体魄", null)).toBeNull();
    expect(shouhunRule.lookupFallback("体魄", shouhunRule.initCharacter())).toBeNull();
  });
});

describe("shouhunRule.computeDerived", () => {
  it("identity for non-shouhun sheets", () => {
    const coc: CharacterData = { ruleTemplate: "coc7th" };
    expect(shouhunRule.computeDerived(coc)).toBe(coc);
  });

  it("normalizes attributes to 1..9 and re-clamps currents", () => {
    const sheet: CharacterData = {
      ruleTemplate: "shouhun",
      shAttributes: { phy: 99, wis: 0, soul: 5 },
      shSheet: { hp_current: 50, mana_current: 50 },
    };
    const out = shouhunRule.computeDerived(sheet);
    expect(out.shAttributes).toEqual({ phy: 9, wis: 1, soul: 5 });
    expect(out.shSheet?.hp_current).toBe(9);    // 5 + ⌊9/2⌋
    expect(out.shSheet?.mana_current).toBe(12); // 5 + 2 + 5
  });
});

describe("shouhunRule.applyStatWrite", () => {
  it("attribute write clamps to 1..9 and re-clamps currents", () => {
    const sheet = shouhunRule.initCharacter();
    sheet.shSheet = { hp_current: 6, mana_current: 14 };
    const { sheet: out, finalValue } = shouhunRule.applyStatWrite(
      sheet, { kind: "attribute", key: "phy", canonical: "体魄" }, 42
    );
    expect(finalValue).toBe(9);
    expect(out.shAttributes?.phy).toBe(9);
    expect(out.shSheet?.hp_current).toBe(6); // still ≤ new max (9)
  });

  it("shrinking an attribute pulls the current below the new max", () => {
    const sheet: CharacterData = {
      ruleTemplate: "shouhun",
      shAttributes: { phy: 9, wis: 3, soul: 3 },
      shSheet: { hp_current: 9 },
    };
    const { sheet: out } = shouhunRule.applyStatWrite(
      sheet, { kind: "attribute", key: "phy", canonical: "体魄" }, 1
    );
    expect(out.shSheet?.hp_current).toBe(5); // 5 + ⌊1/2⌋ = 5
  });

  it("resource write clamps to the derived max", () => {
    const sheet = shouhunRule.initCharacter(); // hpMax 6, manaMax 14
    const hp = shouhunRule.applyStatWrite(
      sheet, { kind: "resource", key: "hp", canonical: "生命值" }, 99
    );
    expect(hp.finalValue).toBe(6);
    expect(hp.sheet.shSheet?.hp_current).toBe(6);
    const mana = shouhunRule.applyStatWrite(
      sheet, { kind: "resource", key: "mana", canonical: "灵力值" }, -5
    );
    expect(mana.finalValue).toBe(0);
    expect(mana.sheet.shSheet?.mana_current).toBe(0);
  });
});

describe("shouhunRule.exportSnapshot", () => {
  it("carries attributes, letter grades, strengths, 灵识 and resources", () => {
    const sheet: CharacterData = {
      ruleTemplate: "shouhun",
      shAttributes: { phy: 9, wis: 6, soul: 7 },
      shSheet: { hp_current: 4 },
    };
    expect(shouhunRule.exportSnapshot(sheet)).toEqual({
      attributes: { phy: 9, wis: 6, soul: 7 },
      grades: { phy: "SSS+", wis: "S", soul: "SS" },
      strengths: { phyStrength: 4, spellStrength: 3, psychicStrength: 3 },
      spiritSense: 22,
      hp: 4,
      hpMax: 9,
      mana: 24, // no stored current → falls back to derived max
      manaMax: 24,
    });
  });

  it("is empty without attributes", () => {
    expect(shouhunRule.exportSnapshot({ ruleTemplate: "shouhun" })).toEqual({});
  });
});

describe("shouhunRule.parseQuickCheckArgs (.r shorthand)", () => {
  it.each([
    ["+2+1",    { skillName: "", modifierExpression: "+2d4+1d6" }],
    ["+3",      { skillName: "", modifierExpression: "+3d4" }],
    ["-2",      { skillName: "", modifierExpression: "-2d6" }],
    ["+2+1 12", { skillName: "", modifierExpression: "+2d4+1d6", explicitTarget: 12 }],
    ["+3-2 15", { skillName: "", modifierExpression: "+3d4-2d6", explicitTarget: 15 }],
    ["+0",      { skillName: "" }],
  ])("claims %o as a nameless check", (input, expected) => {
    const result = shouhunRule.parseQuickCheckArgs!(input);
    const clean = Object.fromEntries(Object.entries(result!).filter(([, v]) => v !== undefined));
    expect(clean).toEqual(expected);
  });

  it("declines everything else so .r stays a generic roller", () => {
    expect(shouhunRule.parseQuickCheckArgs!("")).toBeNull();
    expect(shouhunRule.parseQuickCheckArgs!("3d6")).toBeNull();
    expect(shouhunRule.parseQuickCheckArgs!("+2d8")).toBeNull();
    expect(shouhunRule.parseQuickCheckArgs!("20")).toBeNull();
    expect(shouhunRule.parseQuickCheckArgs!("侦查+2")).toBeNull();
    expect(shouhunRule.parseQuickCheckArgs!("+21")).toBeNull();   // x out of range
    expect(shouhunRule.parseQuickCheckArgs!("+2-4")).toBeNull();  // |y| out of range
  });

  it("other rules do not implement the shorthand", () => {
    expect(coc7thRule.parseQuickCheckArgs).toBeUndefined();
    expect(dnd5eRule.parseQuickCheckArgs).toBeUndefined();
    expect(basicRule.parseQuickCheckArgs).toBeUndefined();
  });
});

describe("shouhunRule.resolveCheck — per-die breakdown (rollDisplay)", () => {
  const TERMS_2D4_1D6 = [
    { sign: "+" as const, count: 2, faces: 4, rolls: [3, 4], sum: 7, isConstant: false },
    { sign: "+" as const, count: 1, faces: 6, rolls: [2], sum: 2, isConstant: false },
  ];

  it("builds structural notation and per-die display from modifierTerms", () => {
    mockRollDie.mockReturnValueOnce(14);
    const r = shouhunRule.resolveCheck({
      skillName: "侦查", target: 0, sheet: null,
      explicitTarget: 12, modifierValue: 9, modifierTerms: TERMS_2D4_1D6,
    });
    expect(r.total).toBe(23);
    expect(r.notation).toBe("1d20+2d4+1d6");
    const check = (r.detail as { check: Record<string, unknown> }).check;
    expect(check.rollDisplay).toBe("d20[14] + 2d4[3, 4] + 1d6[2]");
  });

  it("negative style dice render with a minus sign", () => {
    mockRollDie.mockReturnValueOnce(15);
    const r = shouhunRule.resolveCheck({
      skillName: "侦查", target: 0, sheet: null,
      modifierValue: -4,
      modifierTerms: [{ sign: "-", count: 2, faces: 6, rolls: [1, 3], sum: 4, isConstant: false }],
    });
    expect(r.total).toBe(11);
    expect(r.notation).toBe("1d20-2d6");
    const check = (r.detail as { check: Record<string, unknown> }).check;
    expect(check.rollDisplay).toBe("d20[15] - 2d6[1, 3]");
  });

  it("plain check (no modifier) still shows the d20 face", () => {
    mockRollDie.mockReturnValueOnce(10);
    const r = shouhunRule.resolveCheck({ skillName: "侦查", target: 0, sheet: null });
    expect(r.notation).toBe("1d20");
    const check = (r.detail as { check: Record<string, unknown> }).check;
    expect(check.rollDisplay).toBe("d20[10]");
  });
});

// ---------------------------------------------------------------------------
// Host title (每套规则对主持人的称呼)
// ---------------------------------------------------------------------------

describe("hostLabelKey", () => {
  // The rule that owns a room decides what the person running it is called.
  // Getting this wrong is invisible to types, so pin the mapping here.
  const EXPECTED: Record<string, string> = {
    coc7th: "kp",
    dnd5e: "dm",
    triangle: "manager",
    shouhun: "gm",
    basic: "gm",
  };

  it("每套规则都声明了预期的主持人称呼", () => {
    for (const rule of listRules()) {
      expect(rule.capabilities.hostLabelKey).toBe(EXPECTED[rule.id]);
    }
    // Guards against a new rule silently skipping the mapping above.
    expect([...listRuleIds()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("称呼的 i18n key 在 zh/en 两份文案里都存在", async () => {
    const [zh, en] = await Promise.all([
      import("../../../messages/zh.json"),
      import("../../../messages/en.json"),
    ]);
    const zhLabels = (zh.default as { hostLabels: Record<string, string> }).hostLabels;
    const enLabels = (en.default as { hostLabels: Record<string, string> }).hostLabels;
    for (const rule of listRules()) {
      const key = rule.capabilities.hostLabelKey;
      expect(zhLabels[key], `zh.hostLabels.${key}`).toBeTruthy();
      expect(enLabels[key], `en.hostLabels.${key}`).toBeTruthy();
    }
    expect(zhLabels.kp).toBe("KP");
    expect(zhLabels.dm).toBe("DM");
    expect(zhLabels.manager).toBe("经理");
    expect(zhLabels.gm).toBe("主持人");
  });
});

// ---------------------------------------------------------------------------
// Player title (每套规则对玩家的称呼)
// ---------------------------------------------------------------------------

describe("playerLabelKey", () => {
  // Same contract as hostLabelKey: the rule decides what its players are
  // called (COC 调查员, 5e 冒险者, Triangle 特工, 狩魂者 狩魂者); only rules
  // without a title of their own fall back to 玩家/Player.
  const EXPECTED: Record<string, string> = {
    coc7th: "investigator",
    dnd5e: "adventurer",
    triangle: "agent",
    shouhun: "soulHunter",
    basic: "player",
  };

  it("每套规则都声明了预期的玩家称呼", () => {
    for (const rule of listRules()) {
      expect(rule.capabilities.playerLabelKey).toBe(EXPECTED[rule.id]);
    }
    // Guards against a new rule silently skipping the mapping above.
    expect([...listRuleIds()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("称呼的 i18n key 在 zh/en 两份文案里都存在", async () => {
    const [zh, en] = await Promise.all([
      import("../../../messages/zh.json"),
      import("../../../messages/en.json"),
    ]);
    const zhLabels = (zh.default as { playerLabels: Record<string, string> }).playerLabels;
    const enLabels = (en.default as { playerLabels: Record<string, string> }).playerLabels;
    for (const rule of listRules()) {
      const key = rule.capabilities.playerLabelKey;
      expect(zhLabels[key], `zh.playerLabels.${key}`).toBeTruthy();
      expect(enLabels[key], `en.playerLabels.${key}`).toBeTruthy();
    }
    expect(zhLabels.investigator).toBe("调查员");
    expect(zhLabels.adventurer).toBe("冒险者");
    expect(zhLabels.agent).toBe("特工");
    expect(zhLabels.soulHunter).toBe("狩魂者");
    expect(zhLabels.player).toBe("玩家");
  });
});

// ---------------------------------------------------------------------------
// Derived stat cards (角色卡只读衍生属性)
// ---------------------------------------------------------------------------

describe("capabilities.derivedStats", () => {
  it("狩魂者声明 术法强度,且 label 在 zh/en 文案里都存在", async () => {
    const rule = getRule("shouhun");
    expect(rule.capabilities.derivedStats).toEqual([
      { key: "spellStrength", labelKey: "shSpellStrength" },
    ]);
    const [zh, en] = await Promise.all([
      import("../../../messages/zh.json"),
      import("../../../messages/en.json"),
    ]);
    const zhChar = (zh.default as { character: Record<string, string> }).character;
    const enChar = (en.default as { character: Record<string, string> }).character;
    expect(zhChar.shSpellStrength).toBe("术法强度");
    expect(enChar.shSpellStrength).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// readStatus (聊天头像悬浮窗读取角色卡)
// ---------------------------------------------------------------------------

describe("readStatus", () => {
  it("每套规则返回的资源键都是它自己声明的 resourceBars 键", () => {
    // The hover card iterates `capabilities.resourceBars` and looks each key
    // up in `readStatus().resources` — a key mismatch silently blanks a bar.
    for (const rule of listRules()) {
      const status = rule.readStatus(rule.initCharacter());
      const declared = rule.capabilities.resourceBars.map(r => r.key).sort();
      expect(Object.keys(status.resources).sort(), rule.id).toEqual(declared);
    }
  });

  it("空/异规则角色卡不会抛错,返回空资源", () => {
    for (const rule of listRules()) {
      expect(rule.readStatus({ ruleTemplate: "basic" }), rule.id).toEqual({ resources: {} });
    }
  });

  it("COC 读出 HP/SAN/MP 当前值与上限,以及幸运", () => {
    const sheet = coc7thRule.initCharacter();
    sheet.cocDerived!.hp_current = 3;
    const derived = computeCocDerived(COC_DEFAULT_ATTRIBUTES);
    const status = coc7thRule.readStatus(sheet);
    expect(status.resources.hp).toEqual({ current: 3, max: derived.hpMax });
    expect(status.resources.san).toEqual({ current: derived.san, max: derived.sanMax });
    expect(status.resources.mp).toEqual({ current: derived.mp, max: derived.mpMax });
    expect(status.attributes).toEqual({ luck: derived.luck });
  });

  it("d20 读出 HP,current 缺省时回落到上限", () => {
    const sheet: CharacterData = { ruleTemplate: "dnd5e", d20Sheet: { hpMax: 12 } };
    expect(dnd5eRule.readStatus(sheet).resources.hp).toEqual({ current: 12, max: 12 });
    sheet.d20Sheet!.hp_current = 5;
    expect(dnd5eRule.readStatus(sheet).resources.hp).toEqual({ current: 5, max: 12 });
  });

  it("Triangle 的嘉奖/处分是无上限计数器", () => {
    const sheet: CharacterData = { ruleTemplate: "triangle", taSheet: { commendations: 2, reprimands: 1 } };
    const status = triangleRule.readStatus(sheet);
    expect(status.resources.commendations).toEqual({ current: 2 });
    expect(status.resources.reprimands).toEqual({ current: 1 });
    expect(status.resources.commendations.max).toBeUndefined();
  });

  it("狩魂者现算上限、术法强度与属性评级", () => {
    const sheet = shouhunRule.initCharacter();
    sheet.shAttributes = { phy: 5, wis: 7, soul: 3 };
    const derived = computeShDerived(sheet.shAttributes);
    const status = shouhunRule.readStatus(sheet);
    expect(status.resources.hp.max).toBe(derived.hpMax);
    expect(status.resources.mana.max).toBe(derived.manaMax);
    expect(status.derived).toEqual({ spellStrength: derived.spellStrength });
    expect(status.attributes).toEqual({ phy: 5, wis: 7, soul: 3 });
    expect(status.attributeGrades).toEqual({
      phy: shGradeLabel(5), wis: shGradeLabel(7), soul: shGradeLabel(3),
    });
  });

  it("statusAttributeKeys 只引用本规则已声明的属性,且 label 有文案", async () => {
    const [zh, en] = await Promise.all([
      import("../../../messages/zh.json"),
      import("../../../messages/en.json"),
    ]);
    const zhChar = (zh.default as { character: Record<string, string> }).character;
    const enChar = (en.default as { character: Record<string, string> }).character;
    for (const rule of listRules()) {
      const declared = rule.capabilities.attributeKeys.map(a => a.key);
      for (const spec of rule.capabilities.statusAttributeKeys ?? []) {
        expect(declared, `${rule.id}.${spec.key}`).toContain(spec.key);
        expect(zhChar[spec.labelKey], `zh.character.${spec.labelKey}`).toBeTruthy();
        expect(enChar[spec.labelKey], `en.character.${spec.labelKey}`).toBeTruthy();
      }
    }
  });
});
