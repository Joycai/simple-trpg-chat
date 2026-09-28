import { describe, expect, it } from "vitest";
import type { LegacySheet } from "@/lib/character/legacy";
import { findResource, resolveSheet } from "@/lib/character/sheet-model";
import { getRule, listRules } from "../registry";
import fixture from "./fixtures/legacy-sheets.json";

/**
 * Upgrading an old sheet must not change a single number the old code showed.
 *
 * `fixtures/legacy-sheets.json` was produced by the pre-v2 rule methods before
 * they were deleted: 41 sheets per rule (the seeded one plus random sequences
 * of writeAttributes → computeDerived, applyResourcePatch and applyStatWrite),
 * each stored with what the old readers returned — readAttributes and
 * readStatus (resources, derived values, status attributes). Every case is
 * upgraded with `migrateLegacy` and read back through `resolveSheet`.
 */

interface Case {
  ruleId: string;
  legacy: LegacySheet;
  expected: {
    attributes: Record<string, number>;
    resources: Record<string, { current: number; max?: number }>;
    derived: Record<string, number>;
    statusAttributes: Record<string, number>;
  };
}

const cases = fixture as unknown as Case[];

describe.each(listRules().map((r) => [r.id, r] as const))("migrateLegacy: %s", (id, rule) => {
  const mine = cases.filter((c) => c.ruleId === id);

  it("has snapshot cases", () => {
    expect(mine.length).toBeGreaterThan(30);
  });

  it("reads back every value the old code showed", () => {
    for (const { legacy, expected } of mine) {
      const resolved = resolveSheet(rule, rule.migrateLegacy(legacy));
      for (const f of rule.sheet.attributes) {
        expect(resolved.attributeValues[f.key], f.key).toBe(expected.attributes[f.key]);
      }
      for (const [key, r] of Object.entries(expected.resources)) {
        const res = findResource(resolved, key);
        expect(res, key).toBeDefined();
        expect(res!.current, `${key}.current`).toBe(r.current);
        expect(res!.max, `${key}.max`).toBe(r.max);
      }
      for (const [key, v] of Object.entries(expected.derived)) {
        expect(resolved.derived[key], key).toBe(v);
      }
      for (const [key, v] of Object.entries(expected.statusAttributes)) {
        expect(resolved.attributeValues[key], key).toBe(v);
      }
    }
  });

  it("keeps profile fields and custom attributes", () => {
    const legacy: LegacySheet = {
      ruleTemplate: id, name: "林雾", age: 27, occupation: "记者", bio: "…",
      customAttributes: [{ name: "信仰", value: 3 }],
    };
    expect(rule.migrateLegacy(legacy)).toMatchObject({
      schemaVersion: 2, ruleTemplate: id,
      name: "林雾", age: 27, occupation: "记者", bio: "…", customAttributes: [{ name: "信仰", value: 3 }],
    });
  });
});

describe("migrateLegacy: what counts as set", () => {
  const coc = getRule("coc7th");
  const cocDefaults = { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 };
  const cocSeed = { hp: 10, hpMax: 10, san: 50, sanMax: 99, mp: 10, mpMax: 10, mov: 8, db: "0", build: 0, luck: 50 };

  it("treats a seeded, untouched sheet as fully unset", () => {
    // The first snapshot of each rule is its freshly seeded sheet.
    for (const rule of listRules()) {
      const seeded = cases.find((c) => c.ruleId === rule.id)!.legacy;
      const v2 = rule.migrateLegacy(seeded);
      expect(v2.attributes, rule.id).toEqual({});
      expect(v2.resources, rule.id).toEqual({});
    }
  });

  it("marks the whole grid set once any attribute moved off its default", () => {
    const v2 = coc.migrateLegacy({ ruleTemplate: "coc7th", cocAttributes: { ...cocDefaults, str: 70 }, cocDerived: cocSeed });
    expect(Object.keys(v2.attributes)).toHaveLength(9);
    expect(v2.attributes).toMatchObject({ str: 70, dex: 50 });
  });

  it("keeps a resource current only when it differs from the unset reading", () => {
    const v2 = coc.migrateLegacy({
      ruleTemplate: "coc7th",
      cocAttributes: { ...cocDefaults, pow: 60 },
      cocDerived: { ...cocSeed, san: 60, hp_current: 4, san_current: 60 },
    });
    expect(v2.resources.hp).toEqual({ current: 4 });
    expect(v2.resources.san).toBeUndefined(); // 60 = POW = starting SAN
  });

  it("reads a COC san written only to the base field", () => {
    const v2 = coc.migrateLegacy({ ruleTemplate: "coc7th", cocAttributes: cocDefaults, cocDerived: { ...cocSeed, san: 30 } });
    expect(v2.resources.san).toEqual({ current: 30 });
  });

  it("counts the d20 seed HP max as unset, a changed one as set", () => {
    const d20 = getRule("dnd5e");
    const attrs = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, pb: 2, ac: 10 };
    const seed = { ruleTemplate: "dnd5e", d20Attributes: attrs, d20Sheet: { level: 1, hpMax: 10, hp_current: 10 } };
    expect(d20.migrateLegacy(seed).resources.hp).toBeUndefined();
    expect(d20.migrateLegacy({ ...seed, d20Sheet: { hpMax: 24, hp_current: 24 } }).resources.hp).toEqual({ max: 24 });
    expect(d20.migrateLegacy({ ...seed, d20Attributes: { ...attrs, str: 16 } }).resources.hp).toEqual({ max: 10 });
  });

  it("carries d20 role and level into the profile", () => {
    const d20 = getRule("dnd5e");
    expect(d20.migrateLegacy({ ruleTemplate: "dnd5e", d20Sheet: { role: "法师", level: 3, hpMax: 10, hp_current: 10 } }))
      .toMatchObject({ role: "法师", level: 3 });
  });
});
