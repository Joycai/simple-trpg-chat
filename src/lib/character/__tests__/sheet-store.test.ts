import { describe, expect, it } from "vitest";
import { parseSheet, parseSheetOrNull, serializeSheet, storedRevision } from "../sheet-store";
import { emptySheet } from "../sheet-v2";
import { CHARACTER_DATA_MAX_BYTES } from "../types";

const cocDefaults = { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 };

describe("parseSheetOrNull", () => {
  it("returns null when there is no usable sheet", () => {
    expect(parseSheetOrNull(null)).toBeNull();
    expect(parseSheetOrNull("")).toBeNull();
    expect(parseSheetOrNull("{nope")).toBeNull();
    expect(parseSheetOrNull("[1,2]")).toBeNull();
    expect(parseSheetOrNull('{"bio":"no rule"}')).toBeNull();
  });

  it("passes a v2 sheet through, normalized to its schema", () => {
    const raw = { schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 70, junk: 1 }, resources: { san: { current: 500 } } };
    expect(parseSheetOrNull(JSON.stringify(raw))).toEqual({
      schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 70 }, resources: { san: { current: 99 } },
    });
  });

  it("repairs a v2 sheet missing its value maps", () => {
    expect(parseSheetOrNull({ schemaVersion: 2, ruleTemplate: "basic" })).toEqual(emptySheet("basic"));
  });

  it("upgrades a legacy sheet under its own rule", () => {
    const legacy = { ruleTemplate: "coc7th", cocAttributes: { ...cocDefaults, str: 70 } };
    expect(parseSheetOrNull(legacy)).toMatchObject({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 70 } });
  });

  it("keeps an unregistered rule id visible", () => {
    expect(parseSheetOrNull({ ruleTemplate: "gone" })?.ruleTemplate).toBe("gone");
  });

  it("upgrades a mixed legacy row under the room rule when that rule's bag has data", () => {
    // A bot built for COC kept receiving d20 writes after the room switched.
    const mixed = {
      ruleTemplate: "coc7th",
      cocAttributes: { ...cocDefaults, str: 70 },
      d20Attributes: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10, pb: 2, ac: 10 },
    };
    expect(parseSheetOrNull(mixed, "dnd5e")).toMatchObject({ ruleTemplate: "dnd5e", attributes: { str: 16 } });
    // Without room-rule data it stays under its own rule (and shows the mismatch).
    const coc = { ruleTemplate: "coc7th", cocAttributes: { ...cocDefaults, str: 70 } };
    expect(parseSheetOrNull(coc, "dnd5e")).toMatchObject({ ruleTemplate: "coc7th", attributes: { str: 70 } });
  });
});

describe("storedRevision", () => {
  it("reads a positive integer rev and treats anything else as 0", () => {
    expect(storedRevision(JSON.stringify({ ...emptySheet("coc7th"), rev: 3 }))).toBe(3);
    expect(storedRevision({ rev: 7 })).toBe(7);
    for (const raw of [null, "", "{nope", "[]", { rev: 0 }, { rev: -2 }, { rev: 1.5 }, { rev: "4" }, {}]) {
      expect(storedRevision(raw)).toBe(0);
    }
  });

  it("keeps a valid rev on a parsed v2 sheet and drops an invalid one", () => {
    expect(parseSheetOrNull({ ...emptySheet("coc7th"), rev: 3 })?.rev).toBe(3);
    expect(parseSheetOrNull({ ...emptySheet("coc7th"), rev: "3" })).not.toHaveProperty("rev");
  });
});

describe("parseSheet", () => {
  it("falls back to an empty sheet for the given rule", () => {
    expect(parseSheet(null, "dnd5e")).toEqual(emptySheet("dnd5e"));
    expect(parseSheet("{nope", "no-such-rule")).toEqual(emptySheet("basic"));
  });
});

describe("serializeSheet", () => {
  it("refuses a sheet over the size cap", () => {
    expect(serializeSheet(emptySheet("basic"))).toBe(JSON.stringify(emptySheet("basic")));
    expect(serializeSheet({ ...emptySheet("basic"), bio: "x".repeat(CHARACTER_DATA_MAX_BYTES) })).toBeNull();
  });
});
