import { describe, it, expect } from "vitest";
import { getRule, type RuleCapabilities } from "@/lib/rules";
import {
  parseCharData, buildAttributeValues, draftStatusFor, currentsFromStatus, buildCharacterExportText,
} from "../panel-status";

describe("parseCharData", () => {
  it("returns an empty object for missing or broken JSON", () => {
    expect(parseCharData(null)).toEqual({});
    expect(parseCharData("{nope")).toEqual({});
    expect(parseCharData('{"bio":"x"}')).toEqual({ bio: "x" });
  });
});

describe("status drafting", () => {
  it("reads the current value of each resource bar the status snapshot has", () => {
    const attrs = buildAttributeValues("coc7th", undefined, undefined);
    const status = draftStatusFor("coc7th", {}, attrs);
    const currents = currentsFromStatus("coc7th", status);
    const expected = getRule("coc7th").capabilities.resourceBars
      .map((b) => b.key)
      .filter((k) => status.resources[k]);
    expect(expected.length).toBeGreaterThan(0);
    expect(Object.keys(currents).sort()).toEqual([...expected].sort());
    for (const k of expected) expect(currents[k]).toBe(status.resources[k].current);
  });

  it("gives the basic rule no attributes", () => {
    expect(buildAttributeValues("basic", undefined, undefined)).toEqual({});
  });
});

describe("buildCharacterExportText", () => {
  const cap = {
    hasRoleLevel: true,
    resourceBars: [{ key: "hp", labelKey: "hp" }, { key: "marks", labelKey: "marks", style: "counter" }],
    derivedStats: [{ key: "power", labelKey: "power" }],
    attributeKeys: [{ key: "str", labelKey: "str" }, { key: "dex", labelKey: "dex" }],
  } as unknown as RuleCapabilities;

  it("lists role, resources, derived stats, graded attributes, skills and bio", () => {
    const text = buildCharacterExportText({
      t: (k) => k, nickname: "Ann", cap, role: "Fighter", level: 3,
      currentResources: { hp: 7, marks: 2 }, resourceMaxes: { hp: 10 },
      derivedValues: { power: 4, spiritSense: 5 }, attributeGrades: { str: "A" },
      attributeValues: { str: 60 }, skills: [{ skillName: "Spot", skillValue: 40 }], bio: "  hi  ",
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
    const bare = { ...cap, hasRoleLevel: true, resourceBars: [], derivedStats: undefined, attributeKeys: [] } as unknown as RuleCapabilities;
    const text = buildCharacterExportText({
      t: (k) => k, nickname: "Bo", cap: bare, role: "", level: "",
      currentResources: {}, resourceMaxes: {}, derivedValues: undefined, attributeGrades: undefined,
      attributeValues: {}, skills: [], bio: " ",
    });
    expect(text).toBe("title · Bo\n");
  });
});
