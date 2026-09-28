import { describe, expect, it } from "vitest";
import { dropPaths, newerSheet, overlappingChanges } from "../draft";
import { applySheetEdit, sheetDiff } from "../sheet-model";
import { emptySheet } from "../sheet-v2";
import { testRule } from "./fixtures/test-rule";

describe("overlappingChanges", () => {
  it("keeps only the paths both sides changed", () => {
    expect(overlappingChanges(["attributes.str", "resources.hp.current"], ["resources.hp.current", "profile.bio"]))
      .toEqual(["resources.hp.current"]);
    expect(overlappingChanges([], ["attributes.str"])).toEqual([]);
  });

  it("finds a real conflict between two edits of the same sheet", () => {
    const base = applySheetEdit(testRule, emptySheet("fixture"), { resources: { hp: { current: 8 } } }).sheet;
    const theirs = applySheetEdit(testRule, base, { resources: { hp: { current: 5 } }, attributes: { dex: 60 } }).sheet;
    const mine = applySheetEdit(testRule, base, { resources: { hp: { current: 2 } }, profile: { bio: "x" } }).changed;
    expect(overlappingChanges(sheetDiff(base, theirs), mine)).toEqual(["resources.hp.current"]);
  });
});

describe("dropPaths", () => {
  it("removes the given paths and prunes emptied groups", () => {
    const draft = {
      attributes: { str: 60, dex: 50 },
      resources: { hp: { current: 3 }, ep: { current: 2, max: 9 } },
      profile: { bio: "x" },
      customAttributes: [{ name: "a", value: 1 }],
    };
    expect(dropPaths(draft, ["attributes.str", "resources.hp.current", "resources.ep.max", "profile.bio", "customAttributes"]))
      .toEqual({ attributes: { dex: 50 }, resources: { ep: { current: 2 } } });
    // The input is untouched.
    expect(draft.attributes).toEqual({ str: 60, dex: 50 });
  });

  it("reads an all-dropped draft as no changes", () => {
    expect(dropPaths({ attributes: { str: 1 } }, ["attributes.str"])).toEqual({});
  });
});

describe("newerSheet", () => {
  const at = (rev: number | undefined, str: number) => ({ ...emptySheet("test"), attributes: { str }, ...(rev ? { rev } : {}) });

  it("keeps a saved copy over a refresh that started before the save landed", () => {
    const saved = at(5, 70);
    expect(newerSheet(at(4, 50), saved)).toBe(saved);
    expect(newerSheet(at(undefined, 50), saved)).toBe(saved);
  });

  it("takes the loaded copy once it has caught up or moved past the save", () => {
    const caughtUp = at(5, 70);
    expect(newerSheet(caughtUp, at(5, 70))).toBe(caughtUp);
    const later = at(6, 40);
    expect(newerSheet(later, at(5, 70))).toBe(later);
  });

  it("uses the loaded copy when nothing was saved", () => {
    const loaded = at(2, 50);
    expect(newerSheet(loaded, null)).toBe(loaded);
  });
});
