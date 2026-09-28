import { describe, expect, it } from "vitest";
import {
  applySheetEdit, findAttribute, findResource, resolveSheet, sanitizeCustomAttributes, sheetDiff,
} from "../sheet-model";
import { emptySheet, type CharacterSheetV2, type SheetEdit } from "../sheet-v2";
import { prng, testRule } from "./fixtures/test-rule";

const empty = () => emptySheet("fixture");
const edit = (sheet: CharacterSheetV2, e: SheetEdit) => applySheetEdit(testRule, sheet, e).sheet;

describe("resolveSheet", () => {
  it("reads unset attributes as their defaults and marks them unset", () => {
    const r = resolveSheet(testRule, empty());
    expect(r.attributeValues).toEqual({ str: 50, dex: 50, luck: 40 });
    expect(r.attributes.every((a) => !a.isSet)).toBe(true);
  });

  it("feeds defaults into derive and exposes declared derived fields", () => {
    const r = resolveSheet(testRule, empty());
    expect(r.derived.hpMax).toBe(10);
    expect(r.derivedFields.map((d) => [d.field.key, d.value])).toContainEqual(["db", "0"]);
    expect(r.derivedFields.map((d) => [d.field.key, d.value])).toContainEqual(["mov", 8]);
  });

  it("resolves the three initial-value shapes", () => {
    const r = resolveSheet(testRule, empty());
    expect(findResource(r, "hp")).toMatchObject({ current: 10, max: 10, currentSet: false });
    expect(findResource(r, "san")).toMatchObject({ current: 40, max: 99 }); // sanStart = luck
    expect(findResource(r, "merit")).toMatchObject({ current: 0, max: undefined });
    expect(findResource(r, "ep")).toMatchObject({ current: 10, max: 10, maxSet: false, isSet: false });
  });

  it("keeps an out-of-range stored attribute as-is on read", () => {
    const sheet = { ...empty(), attributes: { str: 150 } };
    expect(findAttribute(resolveSheet(testRule, sheet), "str")).toMatchObject({ value: 150, isSet: true });
  });

  it("treats an editable-max resource as set once its max is set", () => {
    const s = edit(empty(), { resources: { ep: { max: 30 } } });
    expect(findResource(resolveSheet(testRule, s), "ep")).toMatchObject({ max: 30, current: 30, isSet: true, currentSet: false });
  });
});

describe("applySheetEdit", () => {
  it("rounds and clamps attributes into the field range", () => {
    const s = edit(empty(), { attributes: { str: 120.4, dex: -3, luck: 33.6 } });
    expect(s.attributes).toEqual({ str: 99, dex: 0, luck: 34 });
  });

  it("ignores unknown and derived keys", () => {
    const s = edit(empty(), {
      attributes: { str: 60, strength: 70, hpMax: 40 },
      resources: { mov: { current: 3 }, bogus: { current: 1 } },
    });
    expect(s.attributes).toEqual({ str: 60 });
    expect(s.resources).toEqual({});
  });

  it("ignores non-finite numbers and clears with null", () => {
    let s = edit(empty(), { attributes: { str: 60 }, resources: { hp: { current: 5 } } });
    s = edit(s, { attributes: { str: Number.NaN, dex: "x" as unknown as number } });
    expect(s.attributes).toEqual({ str: 60 });
    s = edit(s, { attributes: { str: null }, resources: { hp: { current: null } } });
    expect(s.attributes).toEqual({});
    expect(s.resources).toEqual({});
  });

  it("clamps resource currents to the derived max", () => {
    const s = edit(empty(), { resources: { hp: { current: 50 }, san: { current: -4 } } });
    expect(s.resources).toEqual({ hp: { current: 10 }, san: { current: 0 } });
  });

  it("re-clamps a stored current when an attribute change lowers its max", () => {
    let s = edit(empty(), { attributes: { str: 90, dex: 90 }, resources: { hp: { current: 18 } } });
    expect(s.resources.hp).toEqual({ current: 18 });
    s = edit(s, { attributes: { str: 20 } });
    expect(s.resources.hp).toEqual({ current: 11 });
  });

  it("clamps an editable max to its range and the current to the new max", () => {
    let s = edit(empty(), { resources: { ep: { max: 5000, current: 4000 } } });
    expect(s.resources.ep).toEqual({ max: 999, current: 999 });
    s = edit(s, { resources: { ep: { max: 20 } } });
    expect(s.resources.ep).toEqual({ max: 20, current: 20 });
    s = edit(s, { resources: { ep: { max: null } } });
    expect(s.resources.ep).toEqual({ current: 10 }); // back to the default max
  });

  it("only bounds a counter below and by its cap", () => {
    expect(edit(empty(), { resources: { merit: { current: 500 } } }).resources.merit).toEqual({ current: 500 });
    expect(edit(empty(), { resources: { merit: { current: 5000 } } }).resources.merit).toEqual({ current: 999 });
    expect(edit(empty(), { resources: { merit: { current: -1 } } }).resources.merit).toEqual({ current: 0 });
  });

  it("ignores a max on a resource whose max is not editable", () => {
    expect(edit(empty(), { resources: { hp: { max: 40 } } }).resources).toEqual({});
  });

  it("sanitizes profile fields", () => {
    const s = edit(empty(), {
      profile: { name: "  林雾  ", age: 1200.2, occupation: "", bio: " keep spaces ", role: "法师", level: 3 },
    });
    expect(s).toMatchObject({ name: "林雾", age: 999, bio: " keep spaces " });
    expect(s.occupation).toBeUndefined();
    // the fixture has no role/level
    expect(s.role).toBeUndefined();
    expect(s.level).toBeUndefined();
    expect(edit(s, { profile: { name: null } }).name).toBeUndefined();
  });

  it("replaces custom attributes with a sanitized list", () => {
    const s = edit(empty(), {
      customAttributes: [
        { name: " 信仰 ", value: 3.2 },
        { name: "信仰", value: 9 },
        { name: "", value: 1 },
        { name: "护盾", value: 2, max: 5 },
      ],
    });
    expect(s.customAttributes).toEqual([{ name: "信仰", value: 3 }, { name: "护盾", value: 2, max: 5 }]);
    expect(edit(s, { customAttributes: [] }).customAttributes).toBeUndefined();
  });

  it("reports the changed paths", () => {
    const base = edit(empty(), { attributes: { str: 60 } });
    const { changed } = applySheetEdit(testRule, base, {
      attributes: { str: 60, dex: 70 },
      resources: { ep: { max: 12 } },
      profile: { bio: "x" },
    });
    expect(changed).toEqual(["attributes.dex", "profile.bio", "resources.ep.max"]);
  });

  it("drops unknown keys already in storage on the next write", () => {
    const dirty = { ...empty(), attributes: { str: 60, old: 3 }, resources: { gone: { current: 1 } } } as CharacterSheetV2;
    const s = edit(dirty, {});
    expect(s.attributes).toEqual({ str: 60 });
    expect(s.resources).toEqual({});
  });
});

describe("sanitizeCustomAttributes", () => {
  it("rejects non-arrays and caps the count", () => {
    expect(sanitizeCustomAttributes("nope")).toEqual([]);
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `a${i}`, value: i }));
    expect(sanitizeCustomAttributes(many)).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// Property tests: random edit sequences against the invariants.
// ---------------------------------------------------------------------------

const ATTR_KEYS = ["str", "dex", "luck", "hpMax", "nope"];
const RES_KEYS = ["hp", "san", "ep", "merit", "mov", "nope"];
const VALUES: Array<number | null> = [null, -50, 0, 1, 7, 42, 99, 150, 5000, Number.NaN, Number.POSITIVE_INFINITY, 12.6];

function randomEdit(rand: () => number): SheetEdit {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const e: SheetEdit = {};
  if (rand() < 0.6) {
    e.attributes = {};
    for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) e.attributes[pick(ATTR_KEYS)] = pick(VALUES);
  }
  if (rand() < 0.6) {
    e.resources = {};
    for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
      const p: { current?: number | null; max?: number | null } = {};
      if (rand() < 0.7) p.current = pick(VALUES);
      if (rand() < 0.4) p.max = pick(VALUES);
      e.resources[pick(RES_KEYS)] = p;
    }
  }
  return e;
}

describe("applySheetEdit invariants (random edit sequences)", () => {
  const declaredAttrs = new Set(testRule.sheet.attributes.map((f) => f.key));
  const declaredRes = new Set(testRule.sheet.resources.map((f) => f.key));

  for (const seed of [1, 7, 42, 1234, 99999]) {
    it(`holds for seed ${seed}`, () => {
      const rand = prng(seed);
      let sheet = empty();
      for (let step = 0; step < 300; step++) {
        const e = randomEdit(rand);
        const once = applySheetEdit(testRule, sheet, e).sheet;

        // ① resource currents stay within bounds
        for (const r of resolveSheet(testRule, once).resources) {
          expect(r.current).toBeGreaterThanOrEqual(r.min);
          if (r.max !== undefined) expect(r.current).toBeLessThanOrEqual(r.max);
          const stored = once.resources[r.field.key]?.current;
          if (stored !== undefined) {
            expect(stored).toBeGreaterThanOrEqual(r.min);
            expect(stored).toBeLessThanOrEqual(r.max ?? r.field.cap ?? Infinity);
          }
        }
        // ② storage holds only declared, finite values
        for (const [k, v] of Object.entries(once.attributes)) {
          expect(declaredAttrs.has(k)).toBe(true);
          expect(Number.isFinite(v)).toBe(true);
        }
        for (const [k, v] of Object.entries(once.resources)) {
          expect(declaredRes.has(k)).toBe(true);
          expect(v.current === undefined || Number.isFinite(v.current)).toBe(true);
          expect(v.max === undefined || Number.isFinite(v.max)).toBe(true);
        }
        // ④ idempotent
        const twice = applySheetEdit(testRule, once, e);
        expect(twice.sheet).toEqual(once);
        expect(twice.changed).toEqual([]);
        // changed paths are exactly the diff
        expect(applySheetEdit(testRule, sheet, e).changed).toEqual(sheetDiff(sheet, once));

        sheet = once;
      }
    });
  }
});
