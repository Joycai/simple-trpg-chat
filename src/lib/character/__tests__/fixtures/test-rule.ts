import type { SheetRule } from "@/lib/rules/sheet-schema";

/**
 * A small rule covering every field shape the schema supports: derived max,
 * derived initial, editable max, unbounded counter, text-valued derivation,
 * and standard skills with a fixed and an attribute-based base.
 */
export const testRule: SheetRule = {
  id: "fixture",
  sheet: {
    attributes: [
      { key: "str", labelKey: "str", min: 0, max: 99, default: 50, required: true },
      { key: "dex", labelKey: "dex", min: 0, max: 99, default: 50, required: true },
      { key: "luck", labelKey: "luck", min: 0, max: 99, default: 40, required: false, inStatus: true },
    ],
    resources: [
      { key: "hp", labelKey: "hp", style: "bar", max: { derived: "hpMax" }, initial: "max", required: false },
      { key: "san", labelKey: "san", style: "bar", max: { derived: "sanMax" }, initial: { derived: "sanStart" }, required: false },
      { key: "ep", labelKey: "ep", style: "bar", max: { editable: { default: 10, min: 1, max: 999 } }, initial: "max", required: true },
      { key: "merit", labelKey: "merit", style: "counter", initial: 0, cap: 999, required: false },
    ],
    derived: [
      { key: "hpMax", labelKey: "hpMax", display: "hidden" },
      { key: "sanMax", labelKey: "sanMax", display: "hidden" },
      { key: "sanStart", labelKey: "sanStart", display: "hidden" },
      { key: "db", labelKey: "db", display: "sheet", format: "text" },
      { key: "mov", labelKey: "mov", display: "both" },
    ],
    standardSkills: [
      { name: "侦查", base: 25, required: false },
      { name: "闪避", base: { fromAttribute: "dex", divisor: 2 }, required: false },
      { name: "信用评级", base: 0, required: true },
    ],
    profile: { roleLevel: false },
    customAttributes: {},
  },
  derive(a) {
    return {
      hpMax: Math.floor((a.str + a.dex) / 10),
      sanMax: 99,
      sanStart: a.luck,
      db: a.str > 60 ? "+1D4" : "0",
      mov: a.str > a.dex ? 9 : 8,
    };
  },
};

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
