import { describe, it, expect } from "vitest";
import { isRollCommand, normalizeRollCommand, parseLeadingDice, pushRecent } from "@/lib/roll-command";

describe("isRollCommand", () => {
  it.each([
    ".rd100",
    ".r 3d6k2+2d20",
    ".r3d6",
    ".rh100",
    ".rc侦查",
    ".rc 侦查",
    "。sc 1/1d6",
    ".ra 力量",
    "  .rd100  ",
  ])("accepts roll command %s", (input) => {
    expect(isRollCommand(input)).toBe(true);
  });

  it.each([
    ".st 侦查50",
    ".st侦查50聆听60",
    ".help",
    "你好",
    "rd100",
    ".",
    "",
    ".xyz",
  ])("rejects non-roll input %s", (input) => {
    expect(isRollCommand(input)).toBe(false);
  });

  // Engine parity: `.rh100` must be seen as `rh`, not swallowed by `.r`;
  // and like the engine, an unknown tail after a valid prefix still matches.
  it("matches the engine's left-to-right alternation", () => {
    expect(isRollCommand(".rhelp")).toBe(true); // engine: rh + "elp"
    expect(isRollCommand(".round")).toBe(true); // engine parity: bare `r` + "ound"
  });
});

describe("normalizeRollCommand", () => {
  it("converts Chinese full-stop prefix and trims", () => {
    expect(normalizeRollCommand("。rd100 ")).toBe(".rd100");
  });

  it("collapses inner whitespace", () => {
    expect(normalizeRollCommand(".rc   侦查\t困难")).toBe(".rc 侦查 困难");
  });
});

describe("pushRecent", () => {
  it("prepends new entries", () => {
    expect(pushRecent([".rd100"], ".r3d6")).toEqual([".r3d6", ".rd100"]);
  });

  it("moves an existing entry to the front instead of duplicating", () => {
    expect(pushRecent([".r3d6", ".rd100", ".rc 侦查"], ".rd100")).toEqual([
      ".rd100",
      ".r3d6",
      ".rc 侦查",
    ]);
  });

  it("evicts the oldest entry beyond the cap", () => {
    const five = [".r1", ".r2", ".r3", ".r4", ".r5"];
    expect(pushRecent(five, ".r6", 5)).toEqual([".r6", ".r1", ".r2", ".r3", ".r4"]);
  });

  it("does not mutate the input list", () => {
    const list = [".rd100"];
    pushRecent(list, ".r3d6");
    expect(list).toEqual([".rd100"]);
  });
});

describe("parseLeadingDice", () => {
  it.each([
    ["1d100", { count: 1, faces: 100 }], // COC / basic
    ["1d20", { count: 1, faces: 20 }], // DnD 5e / 狩魂者
    ["6d4", { count: 6, faces: 4 }], // Triangle Agency
    ["2D6", { count: 2, faces: 6 }], // uppercase D
  ])("parses rule default %s", (input, expected) => {
    expect(parseLeadingDice(input as string)).toEqual(expected);
  });

  it("reads only the leading NdM term of a compound expression", () => {
    expect(parseLeadingDice("3d6k2+2d20")).toEqual({ count: 3, faces: 6 });
  });

  it("clamps the count to maxCount", () => {
    expect(parseLeadingDice("99d4", 20)).toEqual({ count: 20, faces: 4 });
  });

  it.each([null, undefined, "", "no dice here", "0d6", "1d0"])(
    "returns null for unusable input %s",
    (input) => {
      expect(parseLeadingDice(input as string | null | undefined)).toBeNull();
    },
  );
});
