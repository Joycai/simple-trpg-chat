import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `rollDie` so we can drive deterministic outcomes. Keep the rest of
// utils intact in case future helpers in the module reach for them.
vi.mock("@/lib/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/utils")>();
  return { ...original, rollDie: vi.fn() };
});

import { rollDie } from "@/lib/utils";
import { basicRule, coc7thRule, getRule, listRules, listRuleIds, DEFAULT_RULE_ID } from "@/lib/rules";
import { COC_DEFAULT_ATTRIBUTES, computeCocDerived, type CharacterData } from "@/lib/character-types";

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
  });

  it("falls back to default on null/undefined/unknown ids", () => {
    expect(getRule(null).id).toBe(DEFAULT_RULE_ID);
    expect(getRule(undefined).id).toBe(DEFAULT_RULE_ID);
    expect(getRule("dnd5e").id).toBe(DEFAULT_RULE_ID); // future id, not registered yet
    expect(DEFAULT_RULE_ID).toBe("basic");
  });

  it("listRules / listRuleIds enumerate both built-ins", () => {
    const ids = listRuleIds();
    expect(ids).toContain("basic");
    expect(ids).toContain("coc7th");
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
