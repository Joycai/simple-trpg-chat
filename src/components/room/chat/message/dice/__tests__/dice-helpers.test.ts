import { describe, it, expect } from "vitest";
import { keptIndexSet } from "../keep-index";
import { padD100, trimSingleDieNotation } from "../dice-format";

const term = (rolls: number[], keptRolls: number[], keep?: number) =>
  ({ sign: "+" as const, count: rolls.length, faces: 6, keep, rolls, keptRolls });

describe("keptIndexSet", () => {
  it("is null when the term keeps every die or isn't a keep roll", () => {
    expect(keptIndexSet(term([3, 5], [3, 5]))).toBeNull();
    expect(keptIndexSet(term([3, 5, 1], [5, 3], undefined))).toBeNull();
    expect(keptIndexSet(term([3, 5], [3, 5], 2))).toBeNull();
  });

  it("marks the kept positions, matching duplicate faces as a multiset", () => {
    expect([...keptIndexSet(term([4, 2, 4, 1], [4, 4], 2))!]).toEqual([0, 2]);
    expect([...keptIndexSet(term([6, 6, 6], [6], 1))!]).toEqual([0]);
  });
});

describe("dice formatting", () => {
  it("pads single-digit d100 results and leaves the rest alone", () => {
    expect(padD100(3)).toBe("03");
    expect(padD100(0)).toBe("00");
    expect(padD100(42)).toBe("42");
    expect(padD100(-4)).toBe("-4");
    expect(padD100(undefined)).toBe("");
  });

  it("drops the leading 1 of a single-die notation only", () => {
    expect(trimSingleDieNotation("1d100")).toBe("d100");
    expect(trimSingleDieNotation("2d6")).toBe("2d6");
    expect(trimSingleDieNotation(undefined)).toBe("");
  });
});
