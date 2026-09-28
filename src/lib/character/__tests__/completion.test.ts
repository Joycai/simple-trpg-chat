import { describe, expect, it } from "vitest";
import {
  matchStandardSkills, missingFields, sheetCompletion, standardSkillBases,
} from "../completion";
import { applySheetEdit } from "../sheet-model";
import { emptySheet, type CharacterSheetV2, type SheetEdit } from "../sheet-v2";
import { prng, testRule } from "./fixtures/test-rule";

const edit = (sheet: CharacterSheetV2, e: SheetEdit) => applySheetEdit(testRule, sheet, e).sheet;
const stateOf = (c: ReturnType<typeof sheetCompletion>, kind: string, key: string) =>
  c.fields.find((f) => f.kind === kind && f.key === key)?.state;

describe("sheetCompletion", () => {
  it("counts required attributes, resources and standard skills on an empty sheet", () => {
    const c = sheetCompletion(testRule, emptySheet("fixture"));
    // str, dex (attributes) + ep (editable max) + 信用评级 (skill)
    expect(c.requiredTotal).toBe(4);
    expect(c.requiredSet).toBe(0);
    expect(missingFields(c).map((f) => f.key)).toEqual(["str", "dex", "ep", "信用评级"]);
    expect(stateOf(c, "attribute", "luck")).toBe("default");
    expect(stateOf(c, "resource", "hp")).toBe("default");
  });

  it("marks set fields and custom values", () => {
    const s = edit(emptySheet("fixture"), {
      attributes: { str: 60, luck: 20 },
      resources: { ep: { max: 12 } },
      customAttributes: [{ name: "信仰", value: 3 }],
    });
    const c = sheetCompletion(testRule, s, ["信用评级", "侦查", "梦境学"]);
    expect(c.requiredSet).toBe(3);
    expect(stateOf(c, "attribute", "str")).toBe("set");
    expect(stateOf(c, "attribute", "dex")).toBe("missing");
    expect(stateOf(c, "attribute", "luck")).toBe("set");
    expect(stateOf(c, "resource", "ep")).toBe("set");
    expect(stateOf(c, "skill", "侦查")).toBe("set");
    expect(stateOf(c, "skill", "闪避")).toBe("default");
    expect(stateOf(c, "skill", "梦境学")).toBe("custom");
    expect(stateOf(c, "customAttribute", "信仰")).toBe("custom");
    expect(c.skills).toEqual({ standardTotal: 3, standardSet: 2, custom: 1 });
  });

  it("matches alias spellings in either direction", () => {
    const aliases = (n: string) => (n === "侦察" ? ["侦查"] : n === "闪避" ? ["躲闪"] : []);
    const m = matchStandardSkills(testRule.sheet.standardSkills!, ["侦察", "躲闪", "潜行"], aliases);
    expect(m.get("侦察")).toBe("侦查");
    expect(m.get("躲闪")).toBe("闪避");
    expect(m.get("潜行")).toBeUndefined();
  });

  it("derives attribute-based skill bases from the sheet", () => {
    const s = edit(emptySheet("fixture"), { attributes: { dex: 71 } });
    expect(standardSkillBases(testRule, s)).toEqual({ 侦查: 25, 闪避: 35, 信用评级: 0 });
  });

  it("keeps its counts consistent with its field states (random sheets)", () => {
    const rand = prng(3);
    const names = ["信用评级", "侦查", "闪避", "梦境学", "潜行"];
    let s = emptySheet("fixture");
    for (let i = 0; i < 200; i++) {
      const key = ["str", "dex", "luck"][Math.floor(rand() * 3)];
      s = edit(s, {
        attributes: { [key]: rand() < 0.3 ? null : Math.floor(rand() * 99) },
        resources: rand() < 0.3 ? { ep: { max: rand() < 0.5 ? null : 20 } } : undefined,
      });
      const skills = names.filter(() => rand() < 0.5);
      const c = sheetCompletion(testRule, s, skills);
      const required = c.fields.filter((f) => f.required);
      expect(c.requiredTotal).toBe(required.length);
      expect(c.requiredSet).toBe(required.filter((f) => f.state === "set").length);
      expect(c.fields.filter((f) => f.state === "missing").every((f) => f.required)).toBe(true);
      expect(c.fields.filter((f) => f.state === "default").every((f) => !f.required)).toBe(true);
    }
  });
});
