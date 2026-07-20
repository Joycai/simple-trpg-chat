import { describe, it, expect } from "vitest";

import { rebuildSheetForRule, CARRYOVER_KEYS } from "@/lib/character-sheet";
import { coc7thRule, listRules } from "@/lib/rules";
import type { CharacterData } from "@/lib/character-types";

/** A filled-in COC sheet with generic profile data on it. */
function cocSheet(): CharacterData {
  return {
    ...coc7thRule.initCharacter(),
    name: "赵四",
    age: 34,
    occupation: "记者",
    bio: "在密大档案室待过三年。",
    customAttributes: [{ name: "线索点", value: 2, max: 5 }],
  };
}

describe("rebuildSheetForRule", () => {
  it("returns the fresh sheet untouched when there is no previous sheet", () => {
    const fresh = coc7thRule.initCharacter();
    expect(rebuildSheetForRule(null, fresh)).toEqual(fresh);
    expect(rebuildSheetForRule(undefined, fresh)).toEqual(fresh);
  });

  it("keeps the generic profile fields", () => {
    const prev = cocSheet();
    const rebuilt = rebuildSheetForRule(prev, listRules().find(r => r.id === "dnd5e")!.initCharacter());

    expect(rebuilt.name).toBe("赵四");
    expect(rebuilt.age).toBe(34);
    expect(rebuilt.occupation).toBe("记者");
    expect(rebuilt.bio).toBe("在密大档案室待过三年。");
    expect(rebuilt.customAttributes).toEqual([{ name: "线索点", value: 2, max: 5 }]);
  });

  it("drops the previous rule's rule-specific fields", () => {
    const prev = cocSheet();
    expect(prev.cocAttributes).toBeDefined();

    const rebuilt = rebuildSheetForRule(prev, listRules().find(r => r.id === "dnd5e")!.initCharacter());

    expect(rebuilt.ruleTemplate).toBe("dnd5e");
    expect(rebuilt.cocAttributes).toBeUndefined();
    expect(rebuilt.cocDerived).toBeUndefined();
    expect(rebuilt.d20Attributes).toBeDefined();
  });

  it("does not carry resource bars over (they are capability-driven)", () => {
    const prev: CharacterData = { ...cocSheet(), resources: [{ key: "san", label: "SAN", current: 40, max: 99, color: "#8b5cf6", show: true }] };
    const rebuilt = rebuildSheetForRule(prev, listRules().find(r => r.id === "triangle")!.initCharacter());
    expect(rebuilt.resources).toBeUndefined();
    expect(CARRYOVER_KEYS).not.toContain("resources");
  });

  it("produces a sheet matching the target rule for every registered rule", () => {
    for (const rule of listRules()) {
      const rebuilt = rebuildSheetForRule(cocSheet(), rule.initCharacter());
      expect(rebuilt.ruleTemplate).toBe(rule.id);
      // Rule-owned fields come from initCharacter(), unchanged by the carryover.
      expect(rebuilt).toMatchObject(
        Object.fromEntries(
          Object.entries(rule.initCharacter()).filter(([k]) => !(CARRYOVER_KEYS as readonly string[]).includes(k))
        )
      );
    }
  });
});
