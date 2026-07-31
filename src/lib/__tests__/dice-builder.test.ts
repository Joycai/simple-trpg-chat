import { describe, it, expect } from "vitest";
import {
  addDie, adjustTerm, removeTerm, setModifier, buildExpression,
  termRange, totalRange, diceCount, parseExpression, MAX_PER_TERM,
} from "@/lib/dice-builder";

describe("dice-builder tray edits", () => {
  it("merges repeat taps of one face into a single term", () => {
    let terms = addDie([], 6);
    terms = addDie(terms, 6);
    expect(terms).toEqual([{ faces: 6, count: 2 }]);
  });

  it("keeps terms in ascending face order regardless of tap order", () => {
    const terms = addDie(addDie(addDie([], 20), 4), 6);
    expect(terms.map((x) => x.faces)).toEqual([4, 6, 20]);
  });

  it("caps a term rather than letting the expression grow unbounded", () => {
    expect(addDie([], 6, MAX_PER_TERM + 10)[0].count).toBe(MAX_PER_TERM);
  });

  it("drops a term when stepping it down to zero", () => {
    expect(adjustTerm([{ faces: 6, count: 1 }], 6, -1)).toEqual([]);
  });

  it("removes only the targeted face", () => {
    const terms = [{ faces: 4, count: 1 }, { faces: 6, count: 2 }];
    expect(removeTerm(terms, 4)).toEqual([{ faces: 6, count: 2 }]);
  });

  it("bounds the modifier at both ends", () => {
    expect(setModifier(99, 1)).toBe(99);
    expect(setModifier(-99, -1)).toBe(-99);
  });
});

describe("buildExpression", () => {
  const terms = [{ faces: 6, count: 2 }, { faces: 4, count: 1 }];

  it("produces the design's example expression", () => {
    expect(buildExpression(terms, 2)).toBe("1d4+2d6+2");
  });

  it("emits a negative modifier without doubling the sign", () => {
    expect(buildExpression([{ faces: 20, count: 1 }], -3)).toBe("1d20-3");
  });

  it("omits a zero modifier", () => {
    expect(buildExpression([{ faces: 20, count: 1 }], 0)).toBe("1d20");
  });

  // Empty must be falsy, not "0": the panel disables rolling on it, and `.r`
  // with no args would silently roll the rule's default die instead.
  it("returns an empty string for an empty tray", () => {
    expect(buildExpression([], 5)).toBe("");
  });

  it("only emits characters the server-side parser accepts", () => {
    expect(buildExpression(terms, -2)).toMatch(/^[0-9dk+-]+$/);
  });
});

describe("ranges and counts", () => {
  it("computes a single term's span", () => {
    expect(termRange({ faces: 6, count: 2 })).toEqual([2, 12]);
  });

  it("folds the modifier into the total span", () => {
    // 2d6 (2–12) + 1d4 (1–4) + 2  ⇒  5–18, the figure shown in the design.
    expect(totalRange([{ faces: 6, count: 2 }, { faces: 4, count: 1 }], 2)).toEqual([5, 18]);
  });

  it("counts physical dice, not terms", () => {
    expect(diceCount([{ faces: 6, count: 2 }, { faces: 4, count: 1 }])).toBe(3);
  });
});

describe("parseExpression", () => {
  it("round-trips an expression the builder produced", () => {
    const expr = buildExpression([{ faces: 4, count: 1 }, { faces: 6, count: 2 }], 2);
    const back = parseExpression(expr);
    expect(buildExpression(back.terms, back.modifier)).toBe(expr);
  });

  it("reads the presets", () => {
    expect(parseExpression("1d6+1d4")).toEqual({
      terms: [{ faces: 4, count: 1 }, { faces: 6, count: 1 }],
      modifier: 0,
    });
  });

  it("treats a bare face count as one die", () => {
    expect(parseExpression("d20").terms).toEqual([{ faces: 20, count: 1 }]);
  });

  it("sums a negative modifier", () => {
    expect(parseExpression("1d20-3").modifier).toBe(-3);
  });

  it("skips what it cannot represent instead of throwing", () => {
    // `k2` is a server-side keep-highest; the tray has no control for it.
    expect(() => parseExpression("3d100k2+2")).not.toThrow();
    expect(parseExpression("").terms).toEqual([]);
  });
});
