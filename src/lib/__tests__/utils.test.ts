import { describe, it, expect } from "vitest";
import { rollDie, rollDice, formatDiceResult } from "../utils";

describe("Utils - Dice Rolling", () => {
  it("should roll a single die within bounds", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDie(100);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(100);
    }
  });

  it("should roll multiple dice within bounds and calculate sum correctly", () => {
    const { results, sum, notation } = rollDice(6, 3);
    expect(results).toHaveLength(3);
    expect(notation).toBe("3d6");
    expect(sum).toBe(results.reduce((a, b) => a + b, 0));

    results.forEach(r => {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    });
  });

  it("rollDie(1) always returns 1", () => {
    for (let i = 0; i < 50; i++) expect(rollDie(1)).toBe(1);
  });

  it("stays unbiased across the full d6 range over many rolls", () => {
    const faces = 6;
    const N = 120000;
    const counts = new Array(faces).fill(0);
    for (let i = 0; i < N; i++) {
      const r = rollDie(faces);
      counts[r - 1]++;
    }
    const expected = N / faces;
    // Every face must appear, and none may deviate wildly — this guards against
    // modulo bias or an unreachable face. ±15% is ~23σ for a fair die, so it flags
    // gross bias without flaking on a healthy CSPRNG.
    for (const c of counts) {
      expect(c).toBeGreaterThan(expected * 0.85);
      expect(c).toBeLessThan(expected * 1.15);
    }
  });

  it("reaches both extremes (1 and faces) of a d100", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50000; i++) seen.add(rollDie(100));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(100)).toBe(true);
    expect(seen.size).toBe(100);
  });
});

describe("Utils - formatDiceResult", () => {
  it("should format a standard sanity check detail correctly", () => {
    const detail = JSON.stringify({
      dice: "d100",
      count: 1,
      results: [43],
      sum: 43,
      notation: "1d100",
      sanityCheck: {
        oldSanity: 50,
        newSanity: 46,
        deductExpression: "1d6([4])",
        deduction: 4,
        isSuccess: true
      }
    });

    const res = formatDiceResult(detail);
    expect(res).toBe("d100 = 43 ← 理智值(50) Success | Deduct: 1d6([4]) = 4 | Sanity: 50 → 46");
  });

  it("should append temporary insanity warning when deduction is 5 or more", () => {
    const detail = JSON.stringify({
      dice: "d100",
      count: 1,
      results: [85],
      sum: 85,
      notation: "1d100",
      sanityCheck: {
        oldSanity: 50,
        newSanity: 42,
        deductExpression: "1d10([8])",
        deduction: 8,
        isSuccess: false
      }
    });

    const res = formatDiceResult(detail);
    expect(res).toBe("d100 = 85 ← 理智值(50) Failure | Deduct: 1d10([8]) = 8 | Sanity: 50 → 42 [⚠️ Temporary Insanity]");
  });
});
