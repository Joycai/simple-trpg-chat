import { describe, expect, it } from "vitest";
import { applySheetEdit, findResource, resolveSheet } from "@/lib/character/sheet-model";
import { emptySheet, type SheetEdit } from "@/lib/character/sheet-v2";
import { sheetCompletion } from "@/lib/character/completion";
import { getRule } from "../registry";

/**
 * Per-rule sheet behavior through the generic edit/read path — what each
 * rule's own write methods used to guarantee (clamps, derived maxes, starting
 * values), now expressed by its schema + derive.
 */

const edit = (ruleId: string, ...edits: SheetEdit[]) => {
  const rule = getRule(ruleId);
  let sheet = emptySheet(ruleId);
  for (const e of edits) sheet = applySheetEdit(rule, sheet, e).sheet;
  return { sheet, resolved: resolveSheet(rule, sheet) };
};

describe("coc7th sheet", () => {
  it("starts SAN at POW, capped at 99, and derives HP / MP maxes", () => {
    const { resolved } = edit("coc7th", { attributes: { pow: 65, con: 60, siz: 50 } });
    expect(findResource(resolved, "san")).toMatchObject({ current: 65, max: 99, currentSet: false });
    expect(findResource(resolved, "hp")).toMatchObject({ current: 11, max: 11 });
    expect(findResource(resolved, "mp")).toMatchObject({ current: 13, max: 13 });
  });

  it("caps SAN at 99 and never below 0", () => {
    expect(edit("coc7th", { resources: { san: { current: 150 } } }).sheet.resources.san).toEqual({ current: 99 });
    expect(edit("coc7th", { resources: { san: { current: -5 } } }).sheet.resources.san).toEqual({ current: 0 });
  });

  it("re-clamps a stored HP when CON drops", () => {
    const { sheet } = edit("coc7th",
      { attributes: { con: 90, siz: 90 }, resources: { hp: { current: 18 } } },
      { attributes: { con: 30 } });
    expect(sheet.resources.hp).toEqual({ current: 12 });
  });

  it("accepts NPC-scale attributes up to 999", () => {
    expect(edit("coc7th", { attributes: { str: 150, siz: 1200 } }).sheet.attributes).toEqual({ str: 150, siz: 999 });
  });

  it("matches 信用 to the required 信用评级", () => {
    const rule = getRule("coc7th");
    const c = sheetCompletion(rule, emptySheet("coc7th"), ["信用"], rule.skillAliasCandidates);
    expect(c.fields.find((f) => f.key === "信用评级")?.state).toBe("set");
  });

  it("shows damage bonus as text and build as a number", () => {
    const { resolved } = edit("coc7th", { attributes: { str: 80, siz: 70 } });
    expect(resolved.derived).toMatchObject({ db: "+1D4", build: 1 });
  });
});

describe("dnd5e sheet", () => {
  it("reads HP against the default max until one is set", () => {
    expect(findResource(edit("dnd5e").resolved, "hp")).toMatchObject({ current: 10, max: 10, isSet: false });
    const { resolved } = edit("dnd5e", { resources: { hp: { max: 24, current: 30 } } });
    expect(findResource(resolved, "hp")).toMatchObject({ current: 24, max: 24, isSet: true });
  });

  it("clamps abilities to 0–30 and keeps role / level", () => {
    const { sheet } = edit("dnd5e", { attributes: { str: 45 }, profile: { role: "法师", level: 5 } });
    expect(sheet).toMatchObject({ attributes: { str: 30 }, role: "法师", level: 5 });
  });
});

describe("triangle sheet", () => {
  it("floors counters at 0 and leaves them unbounded", () => {
    expect(edit("triangle", { resources: { reprimands: { current: -2 } } }).sheet.resources.reprimands)
      .toEqual({ current: 0 });
    const { resolved } = edit("triangle", { resources: { commendations: { current: 40 } } });
    expect(findResource(resolved, "commendations")).toMatchObject({ current: 40, max: undefined });
  });
});

describe("shouhun sheet", () => {
  it("clamps attributes to 1–9 and derives HP / mana maxes and 灵识", () => {
    const { sheet, resolved } = edit("shouhun", { attributes: { phy: 12, wis: 0, soul: 5 } });
    expect(sheet.attributes).toEqual({ phy: 9, wis: 1, soul: 5 });
    expect(findResource(resolved, "hp")?.max).toBe(5 + 4);
    expect(findResource(resolved, "mana")?.max).toBe(5 + 1 * 2 + 5);
    expect(resolved.derived.spiritSense).toBe(15);
  });

  it("re-clamps mana when 智慧 drops", () => {
    const { sheet } = edit("shouhun",
      { attributes: { wis: 9, soul: 9 }, resources: { mana: { current: 30 } } },
      { attributes: { wis: 1 } });
    expect(sheet.resources.mana).toEqual({ current: 16 });
  });
});
