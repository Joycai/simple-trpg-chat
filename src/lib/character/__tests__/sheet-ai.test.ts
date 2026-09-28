import { describe, expect, it } from "vitest";
import { editFromToolArgs, sheetToolSchema } from "../sheet-ai";
import { applySheetEdit } from "../sheet-model";
import { emptySheet } from "../sheet-v2";
import { getRule } from "@/lib/rules";

describe("sheetToolSchema", () => {
  it("advertises the room rule's attributes with their ranges", () => {
    const props = sheetToolSchema(getRule("coc7th")) as { attributes: { properties: Record<string, { minimum: number; maximum: number }> } };
    expect(Object.keys(props.attributes.properties)).toHaveLength(9);
    expect(props.attributes.properties.str).toMatchObject({ minimum: 0, maximum: 999 });
    expect(props).not.toHaveProperty("role");
  });

  it("offers an HP max only where it is editable, and role/level for d20", () => {
    const d20 = sheetToolSchema(getRule("dnd5e")) as { resources: { properties: Record<string, { properties: Record<string, unknown> }> } };
    expect(Object.keys(d20.resources.properties.hp.properties)).toEqual(["current", "max"]);
    expect(d20).toHaveProperty("role");
    const coc = sheetToolSchema(getRule("coc7th")) as { resources: { properties: Record<string, { properties: Record<string, unknown> }> } };
    expect(Object.keys(coc.resources.properties.hp.properties)).toEqual(["current"]);
  });

  it("advertises nothing sheet-specific for basic", () => {
    expect(sheetToolSchema(getRule("basic"))).toEqual({});
  });
});

describe("editFromToolArgs", () => {
  it("maps tool arguments to an edit the schema then validates", () => {
    const rule = getRule("dnd5e");
    const edit = editFromToolArgs({
      name: "Aria", age: 30, bio: "x", role: "法师", level: 3,
      attributes: { str: 45, strength: 12 },
      resources: { hp: { current: 50, max: 20 }, mana: { current: 3 } },
      customAttributes: [{ name: "护盾", value: 2 }],
      skills: [{ name: "Arcana", value: 5 }],
    });
    const sheet = applySheetEdit(rule, emptySheet("dnd5e"), edit).sheet;
    expect(sheet).toMatchObject({
      name: "Aria", age: 30, bio: "x", role: "法师", level: 3,
      attributes: { str: 30 },
      resources: { hp: { max: 20, current: 20 } },
      customAttributes: [{ name: "护盾", value: 2 }],
    });
  });

  it("ignores malformed groups", () => {
    expect(editFromToolArgs({ attributes: [1, 2], resources: "hp", customAttributes: "x" })).toEqual({});
  });
});
