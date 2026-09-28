import { describe, expect, it } from "vitest";
import { sheetSnapshot } from "../sheet-export";
import { applySheetEdit } from "../sheet-model";
import { emptySheet } from "../sheet-v2";
import { getRule } from "@/lib/rules";

describe("sheetSnapshot", () => {
  it("reports attributes, labelled resources and displayed derived values", () => {
    const rule = getRule("coc7th");
    const sheet = applySheetEdit(rule, emptySheet("coc7th"), {
      attributes: { str: 80, siz: 70, con: 60 }, resources: { hp: { current: 4 } },
    }).sheet;
    const snap = sheetSnapshot(rule, sheet, (k) => `L:${k}`);
    expect(snap.attributes).toMatchObject({ str: 80, dex: 50 });
    expect(snap.unsetAttributes).toContain("dex");
    expect(snap.unsetAttributes).not.toContain("str");
    expect(snap.resources[0]).toEqual({ key: "hp", label: "L:hp", current: 4, max: 13 });
    expect(snap.derived).toMatchObject({ db: "+1D4", build: 1 });
    expect(snap.derived).not.toHaveProperty("hpMax");
    expect(snap).not.toHaveProperty("role");
  });

  it("includes role and level for rules that have them", () => {
    const rule = getRule("dnd5e");
    const sheet = applySheetEdit(rule, emptySheet("dnd5e"), { profile: { role: "法师", level: 3 } }).sheet;
    expect(sheetSnapshot(rule, sheet)).toMatchObject({ role: "法师", level: 3 });
    expect(sheetSnapshot(rule, sheet).resources[0]).not.toHaveProperty("label");
  });
});
