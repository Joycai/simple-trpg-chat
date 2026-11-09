import { describe, it, expect } from "vitest";
import { rollDie, rollDice, isDiceSpec } from "../dice";
import { MAX_DICE_COUNT, MAX_DICE_FACES } from "@/lib/room/limits";

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

describe("dice spec guards", () => {
  // Regression for the event-loop hang: above 2^32 the rejection limit becomes
  // 0 and rollDie would spin synchronously forever. The guard must reject the
  // input without ever entering the loop.
  it.each([
    [2 ** 33, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NaN, 1],
    [6.5, 1],
    [0, 1],
    [-6, 1],
    [6, Number.POSITIVE_INFINITY],
    [6, 2.5],
    [6, 0],
    [6, MAX_DICE_COUNT + 1],
  ])("rejects spec %s d%s", (faces, count) => {
    expect(isDiceSpec(faces, count)).toBe(false);
    expect(() => rollDice(faces, count)).toThrow(RangeError);
    // `rollDie` only owns the faces invariant; a legal face with an illegal
    // count is rejected one level up in `rollDice`.
    if (!Number.isSafeInteger(faces) || faces < 1 || faces > MAX_DICE_FACES) {
      expect(() => rollDie(faces)).toThrow(RangeError);
    }
  });

  it("accepts the inclusive caps", () => {
    expect(isDiceSpec(MAX_DICE_FACES, MAX_DICE_COUNT)).toBe(true);
    expect(rollDice(MAX_DICE_FACES, 1).results[0]).toBeGreaterThanOrEqual(1);
  });
});
