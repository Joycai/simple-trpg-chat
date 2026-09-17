import { describe, it, expect } from "vitest";
import { rollDie, rollDice } from "../dice";

describe("dice rolling", () => {
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
