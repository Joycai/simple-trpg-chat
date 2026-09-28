import { describe, expect, it } from "vitest";
import type { CharacterData } from "@/lib/character/types";
import type { LegacySheet } from "@/lib/character/legacy";
import { findResource, resolveSheet } from "@/lib/character/sheet-model";
import { prng } from "@/lib/character/__tests__/fixtures/test-rule";
import { getRule, listRules } from "../registry";
import type { RuleModule } from "../types";

/**
 * Upgrading an old sheet must not change a single number the old code would
 * have shown. Random old sheets are produced with the old write methods
 * (writeAttributes → computeDerived, applyResourcePatch, applyStatWrite),
 * upgraded with `migrateLegacy`, and read back through `resolveSheet`; every
 * value is compared with the old readers (`readAttributes`, `readStatus`).
 */

const asLegacy = (s: CharacterData) => s as unknown as LegacySheet;

function randomOldSheet(rule: RuleModule, rand: () => number): CharacterData {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  let sheet = rule.initCharacter();
  const steps = int(0, 12);
  for (let i = 0; i < steps; i++) {
    const op = rand();
    if (op < 0.45 && rule.sheet.attributes.length > 0) {
      const f = rule.sheet.attributes[int(0, rule.sheet.attributes.length - 1)];
      sheet = rule.computeDerived(rule.writeAttributes(sheet, { ...rule.readAttributes(sheet), [f.key]: int(f.min, f.max) }));
    } else if (op < 0.7) {
      sheet = rule.computeDerived(rule.applyResourcePatch(sheet, {
        hp_current: rand() < 0.5 ? int(0, 30) : undefined,
        san_current: rand() < 0.5 ? int(0, 99) : undefined,
        mp_current: rand() < 0.5 ? int(0, 30) : undefined,
        mana_current: rand() < 0.5 ? int(0, 40) : undefined,
        hpMax: rand() < 0.3 ? int(1, 60) : undefined,
      }));
    } else if (rule.sheet.resources.length > 0) {
      const f = rule.sheet.resources[int(0, rule.sheet.resources.length - 1)];
      sheet = rule.applyStatWrite(sheet, { kind: "resource", key: f.key, canonical: f.key }, int(0, 60)).sheet;
    }
  }
  return sheet;
}

describe.each(listRules().map((r) => [r.id, r] as const))("migrateLegacy: %s", (_id, rule) => {
  for (const seed of [11, 22, 33, 44, 55, 66]) {
    it(`reads back every old value (seed ${seed})`, () => {
      const rand = prng(seed);
      for (let n = 0; n < 60; n++) {
        const old = randomOldSheet(rule, rand);
        const resolved = resolveSheet(rule, rule.migrateLegacy(asLegacy(old)));

        // Attributes
        const oldAttrs = rule.readAttributes(old);
        for (const f of rule.sheet.attributes) {
          expect(resolved.attributeValues[f.key], `${f.key}`).toBe(oldAttrs[f.key]);
        }

        // Resources, derived values, status attributes
        const status = rule.readStatus(old);
        for (const [key, r] of Object.entries(status.resources)) {
          const res = findResource(resolved, key);
          expect(res, key).toBeDefined();
          expect(res!.current, `${key}.current`).toBe(r.current);
          expect(res!.max, `${key}.max`).toBe(r.max);
        }
        for (const [key, v] of Object.entries(status.derived ?? {})) {
          expect(resolved.derived[key], key).toBe(v);
        }
        for (const [key, v] of Object.entries(status.attributes ?? {})) {
          expect(resolved.attributeValues[key], key).toBe(v);
        }
      }
    });
  }

  it("keeps profile fields and custom attributes", () => {
    const old = {
      ...rule.initCharacter(),
      name: "林雾", age: 27, occupation: "记者", bio: "…", customAttributes: [{ name: "信仰", value: 3 }],
    };
    expect(rule.migrateLegacy(asLegacy(old))).toMatchObject({
      schemaVersion: 2, ruleTemplate: rule.id,
      name: "林雾", age: 27, occupation: "记者", bio: "…", customAttributes: [{ name: "信仰", value: 3 }],
    });
  });
});

describe("migrateLegacy: what counts as set", () => {
  const coc = getRule("coc7th");

  it("treats an untouched seeded sheet as fully unset", () => {
    for (const rule of listRules()) {
      const v2 = rule.migrateLegacy(asLegacy(rule.initCharacter()));
      expect(v2.attributes, rule.id).toEqual({});
      expect(v2.resources, rule.id).toEqual({});
    }
  });

  it("marks the whole grid set once any attribute moved off its default", () => {
    const old = coc.computeDerived(coc.writeAttributes(coc.initCharacter(), { str: 70 }));
    const v2 = coc.migrateLegacy(asLegacy(old));
    expect(Object.keys(v2.attributes)).toHaveLength(9);
    expect(v2.attributes.str).toBe(70);
    expect(v2.attributes.dex).toBe(50);
  });

  it("keeps a resource current only when it differs from the unset reading", () => {
    let old = coc.computeDerived(coc.writeAttributes(coc.initCharacter(), { pow: 60 }));
    old = coc.applyResourcePatch(old, { hp_current: 4, san_current: 60 });
    const v2 = coc.migrateLegacy(asLegacy(old));
    expect(v2.resources.hp).toEqual({ current: 4 });
    expect(v2.resources.san).toBeUndefined(); // 60 = POW = starting SAN
  });

  it("reads a legacy COC san written only to the base field", () => {
    const old = { ...coc.initCharacter() };
    old.cocDerived = { ...old.cocDerived!, san: 30 };
    const v2 = coc.migrateLegacy(asLegacy(old));
    expect(v2.resources.san).toEqual({ current: 30 });
  });

  it("counts the d20 seed HP max as unset, a changed one as set", () => {
    const d20 = getRule("dnd5e");
    expect(d20.migrateLegacy(asLegacy(d20.initCharacter())).resources.hp).toBeUndefined();
    const raised = d20.applyResourcePatch(d20.initCharacter(), { hpMax: 24 });
    expect(d20.migrateLegacy(asLegacy(raised)).resources.hp).toMatchObject({ max: 24 });
    const worked = d20.writeAttributes(d20.initCharacter(), { str: 16 });
    expect(d20.migrateLegacy(asLegacy(worked)).resources.hp).toMatchObject({ max: 10 });
  });

  it("carries d20 role and level into the profile", () => {
    const d20 = getRule("dnd5e");
    const old = { ...d20.initCharacter(), d20Sheet: { role: "法师", level: 3, hpMax: 10, hp_current: 10 } };
    expect(d20.migrateLegacy(asLegacy(old))).toMatchObject({ role: "法师", level: 3 });
  });
});
