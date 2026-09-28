import { describe, expect, it } from "vitest";
import { rebuildSheetForRule, CARRYOVER_KEYS } from "../sheet";
import { emptySheet, type CharacterSheetV2 } from "../sheet-v2";
import { listRules } from "@/lib/rules";

describe("rebuildSheetForRule", () => {
  it("returns an empty sheet for the new rule when there is no previous sheet", () => {
    expect(rebuildSheetForRule(null, "dnd5e")).toEqual(emptySheet("dnd5e"));
    expect(rebuildSheetForRule(undefined, "coc7th")).toEqual(emptySheet("coc7th"));
  });

  it("keeps the generic profile fields", () => {
    const prev: CharacterSheetV2 = {
      ...emptySheet("coc7th"),
      name: "林雾", age: 27, occupation: "记者", bio: "…", avatarUrl: "/a.png",
      customAttributes: [{ name: "信仰", value: 3 }],
    };
    const out = rebuildSheetForRule(prev, "dnd5e");
    for (const key of CARRYOVER_KEYS) expect(out[key]).toEqual(prev[key]);
    expect(out.ruleTemplate).toBe("dnd5e");
  });

  it("drops the previous rule's attributes and resources", () => {
    const prev: CharacterSheetV2 = {
      ...emptySheet("coc7th"),
      attributes: { str: 70 },
      resources: { san: { current: 40 } },
    };
    const out = rebuildSheetForRule(prev, "dnd5e");
    expect(out.attributes).toEqual({});
    expect(out.resources).toEqual({});
  });

  it("drops d20 role and level, which belong to the old rule's profile", () => {
    const prev: CharacterSheetV2 = { ...emptySheet("dnd5e"), role: "法师", level: 3 };
    const out = rebuildSheetForRule(prev, "coc7th");
    expect(out.role).toBeUndefined();
    expect(out.level).toBeUndefined();
  });

  it("produces an empty sheet for every registered rule", () => {
    for (const rule of listRules()) {
      expect(rebuildSheetForRule(emptySheet("basic"), rule.id)).toEqual(emptySheet(rule.id));
    }
  });
});
