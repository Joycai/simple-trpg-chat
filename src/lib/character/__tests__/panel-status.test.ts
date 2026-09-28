import { describe, expect, it } from "vitest";
import { buildCharacterExportText } from "../panel-status";
import { applySheetEdit, resolveSheet } from "../sheet-model";
import { emptySheet } from "../sheet-v2";
import type { SheetRule } from "@/lib/rules/sheet-schema";

const rule: SheetRule = {
  id: "fixture",
  sheet: {
    attributes: [
      { key: "str", labelKey: "str", min: 0, max: 99, default: 0, required: true, badge: (v) => (v >= 60 ? "A" : "C") },
      { key: "dex", labelKey: "dex", min: 0, max: 99, default: 0, required: true },
    ],
    resources: [
      { key: "hp", labelKey: "hp", style: "bar", max: { derived: "hpMax" }, initial: "max", required: false },
      { key: "marks", labelKey: "marks", style: "counter", initial: 0, required: false },
    ],
    derived: [
      { key: "hpMax", labelKey: "hpMax", display: "hidden" },
      { key: "power", labelKey: "power", display: "sheet" },
      { key: "spiritSense", labelKey: "shSpiritSense", display: "sheet" },
    ],
    profile: { roleLevel: true },
    customAttributes: {},
  },
  derive: (a) => ({ hpMax: 10, power: Math.floor(a.str / 15), spiritSense: 5 }),
};

describe("buildCharacterExportText", () => {
  it("lists role, resources, derived values, graded attributes, skills and bio", () => {
    const sheet = applySheetEdit(rule, emptySheet("fixture"), {
      attributes: { str: 60 },
      resources: { hp: { current: 7 }, marks: { current: 2 } },
      profile: { role: "Fighter", level: 3, bio: "  hi  " },
    }).sheet;
    const text = buildCharacterExportText({
      t: (k) => k, nickname: "Ann", rule, resolved: resolveSheet(rule, sheet),
      skills: [{ skillName: "Spot", skillValue: 40 }],
    });
    expect(text.split("\n")).toEqual([
      "title · Ann", "",
      "role: Fighter", "level: 3",
      "hp: 7/10", "marks: 2",
      "power: 4", "shSpiritSense: 5",
      "", "baseAttributes:", "  str: 60 (A)", "  dex: 0",
      "", "tabSkills:", "  Spot: 40",
      "", "tabBackground:", "hi",
    ]);
  });

  it("leaves out empty sections and unset role/level", () => {
    const bare: SheetRule = {
      ...rule,
      sheet: { ...rule.sheet, attributes: [], resources: [], derived: [] },
      derive: () => ({}),
    };
    const text = buildCharacterExportText({
      t: (k) => k, nickname: "Bo", rule: bare,
      resolved: resolveSheet(bare, { ...emptySheet("fixture"), bio: " " }), skills: [],
    });
    expect(text).toBe("title · Bo\n");
  });
});
