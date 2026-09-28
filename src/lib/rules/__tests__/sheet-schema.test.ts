import { describe, expect, it } from "vitest";
import zh from "../../../../messages/zh.json";
import en from "../../../../messages/en.json";
import { listRules } from "../registry";

/**
 * Self-checks every registered rule's sheet schema, so a new rule can't ship
 * a max pointing at a derived value it never computes, a skill base reading
 * an attribute it doesn't have, or a label missing from either language.
 */

const zhChar = (zh as unknown as { character: Record<string, string> }).character;
const enChar = (en as unknown as { character: Record<string, string> }).character;
const zhGroups = (zh as unknown as { character: { skillGroups: Record<string, string> } }).character.skillGroups;
const enGroups = (en as unknown as { character: { skillGroups: Record<string, string> } }).character.skillGroups;

describe.each(listRules().map((r) => [r.id, r] as const))("sheet schema: %s", (_id, rule) => {
  const { sheet } = rule;
  const defaults = Object.fromEntries(sheet.attributes.map((f) => [f.key, f.default]));
  const derived = rule.derive(defaults);

  it("uses unique keys across attributes, resources and derived values", () => {
    const keys = [
      ...sheet.attributes.map((f) => f.key),
      ...sheet.resources.map((f) => f.key),
      ...sheet.derived.map((f) => f.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every attribute default inside its range", () => {
    for (const f of sheet.attributes) {
      expect(f.min).toBeLessThanOrEqual(f.default);
      expect(f.default).toBeLessThanOrEqual(f.max);
    }
  });

  it("points resource maxes and initial values at values derive returns", () => {
    for (const f of sheet.resources) {
      // A text-valued derivation would silently read as 0 here.
      if (f.max && "derived" in f.max) expect(typeof derived[f.max.derived], f.max.derived).toBe("number");
      if (f.max && "editable" in f.max) {
        const e = f.max.editable;
        expect(e.min).toBeLessThanOrEqual(e.max);
        if (e.default !== undefined) {
          expect(e.default).toBeGreaterThanOrEqual(e.min);
          expect(e.default).toBeLessThanOrEqual(e.max);
        }
      }
      if (typeof f.initial === "object") expect(typeof derived[f.initial.derived], f.initial.derived).toBe("number");
      if (f.style === "counter") expect(f.max).toBeUndefined();
    }
  });

  it("declares only derived fields that derive computes", () => {
    for (const f of sheet.derived) expect(derived).toHaveProperty(f.key);
  });

  it("bases standard skills on existing attributes, with unique names", () => {
    const attrKeys = new Set(sheet.attributes.map((f) => f.key));
    const skills = sheet.standardSkills ?? [];
    expect(new Set(skills.map((s) => s.name)).size).toBe(skills.length);
    for (const s of skills) {
      if (typeof s.base === "object") expect(attrKeys.has(s.base.fromAttribute)).toBe(true);
    }
  });

  it("names every standard-skill group in both languages", () => {
    for (const s of sheet.standardSkills ?? []) {
      if (!s.group) continue;
      expect(zhGroups[s.group], `zh skillGroups.${s.group}`).toBeTruthy();
      expect(enGroups[s.group], `en skillGroups.${s.group}`).toBeTruthy();
    }
  });

  it("has every label in both languages", () => {
    const keys = [
      ...sheet.attributes.flatMap((f) => [f.labelKey, f.shortLabelKey]),
      ...sheet.resources.map((f) => f.labelKey),
      ...sheet.derived.flatMap((f) => [f.labelKey, f.formulaKey]),
    ].filter((k): k is string => !!k);
    for (const k of keys) {
      expect(zhChar[k], `zh character.${k}`).toBeTruthy();
      expect(enChar[k], `en character.${k}`).toBeTruthy();
    }
  });
});

describe("rule-specific schema choices", () => {
  const get = (id: string) => listRules().find((r) => r.id === id)!;

  it("COC requires its nine attributes and 信用评级 only", () => {
    const coc = get("coc7th");
    expect(coc.sheet.attributes.filter((f) => f.required)).toHaveLength(9);
    expect(coc.sheet.standardSkills!.filter((s) => s.required).map((s) => s.name)).toEqual(["信用评级"]);
    expect(coc.derive({ str: 50, dex: 50, con: 60, int: 50, pow: 65, edu: 50, siz: 50, app: 50, luck: 50 }))
      .toMatchObject({ hpMax: 11, mpMax: 13, sanMax: 99, sanStart: 65 });
  });

  it("d20 requires the six abilities and the HP max", () => {
    const d20 = get("dnd5e");
    expect(d20.sheet.attributes.filter((f) => f.required).map((f) => f.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
    expect(d20.sheet.resources[0]).toMatchObject({ key: "hp", required: true, max: { editable: { default: 10 } } });
    expect(d20.sheet.profile.roleLevel).toBe(true);
  });

  it("triangle has no required field", () => {
    const ta = get("triangle");
    expect([...ta.sheet.attributes, ...ta.sheet.resources].some((f) => f.required)).toBe(false);
  });

  it("狩魂者 grades its attributes and exposes 灵识 as a derived field", () => {
    const sh = get("shouhun");
    expect(sh.sheet.attributes[0].badge?.(4)).toBe("B");
    expect(sh.sheet.derived.find((d) => d.key === "spiritSense")?.display).toBe("sheet");
  });

  it("basic has no preset fields", () => {
    const basic = get("basic");
    expect(basic.sheet.attributes).toEqual([]);
    expect(basic.sheet.resources).toEqual([]);
    expect(basic.sheet.customAttributes.statusLimit).toBe(2);
  });
});
