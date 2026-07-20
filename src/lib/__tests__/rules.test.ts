import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `rollDie` so we can drive deterministic outcomes. Keep the rest of
// utils intact in case future helpers in the module reach for them.
vi.mock("@/lib/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/utils")>();
  return { ...original, rollDie: vi.fn() };
});

import { rollDie } from "@/lib/utils";
import { basicRule, coc7thRule, dnd5eRule, triangleRule, getRule, listRules, listRuleIds, DEFAULT_RULE_ID } from "@/lib/rules";
import {
  COC_DEFAULT_ATTRIBUTES,
  D20_DEFAULT_ATTRIBUTES,
  TA_DEFAULT_QUALITIES,
  computeCocDerived,
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

  it("only triangle sets highlightDieFace", () => {
    expect(basicRule.capabilities.highlightDieFace).toBeUndefined();
    expect(coc7thRule.capabilities.highlightDieFace).toBeUndefined();
    expect(dnd5eRule.capabilities.highlightDieFace).toBeUndefined();
  });
});
