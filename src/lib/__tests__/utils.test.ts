import { describe, it, expect } from "vitest";
import { rollDie, rollDice } from "../utils";

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
});
