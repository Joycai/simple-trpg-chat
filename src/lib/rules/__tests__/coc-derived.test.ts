import { describe, it, expect } from "vitest";
import { computeCocDerived, type CocAttributes } from "@/lib/rules";

describe("Character - COC 7th derived values", () => {
  it("should calculate correct HP, SAN, and MP", () => {
    const attrs: CocAttributes = {
      str: 50, con: 55, siz: 60, dex: 50,
      app: 50, int: 50, pow: 65, edu: 50, luck: 50,
    };
    const derived = computeCocDerived(attrs);
    expect(derived.hp).toBe(11); // Math.floor((55+60)/10) = 11
    expect(derived.san).toBe(65); // POW = 65
    expect(derived.mp).toBe(13); // Math.floor(65/5) = 13
  });

  it("should calculate correct DB and build based on STR + SIZ", () => {
    // case 1: str + siz = 60 (2 to 64)
    expect(computeCocDerived({ str: 30, con: 50, siz: 30, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 })).toMatchObject({
      db: "-2",
      build: -2
    });

    // case 2: str + siz = 80 (65 to 84)
    expect(computeCocDerived({ str: 40, con: 50, siz: 40, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 })).toMatchObject({
      db: "-1",
      build: -1
    });

    // case 3: str + siz = 100 (85 to 124)
    expect(computeCocDerived({ str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 })).toMatchObject({
      db: "0",
      build: 0
    });

    // case 4: str + siz = 150 (125 to 164)
    expect(computeCocDerived({ str: 75, con: 50, siz: 75, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 })).toMatchObject({
      db: "+1D4",
      build: 1
    });

    // case 5: str + siz = 190 (165 to 204)
    expect(computeCocDerived({ str: 95, con: 50, siz: 95, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 })).toMatchObject({
      db: "+1D6",
      build: 2
    });
  });

  it("should calculate correct MOV based on DEX, STR, and SIZ comparisons", () => {
    // dex < siz && str < siz -> mov = 7
    expect(computeCocDerived({ str: 40, con: 50, siz: 60, dex: 40, app: 50, int: 50, pow: 50, edu: 50, luck: 50 }).mov).toBe(7);

    // dex > siz && str > siz -> mov = 9
    expect(computeCocDerived({ str: 70, con: 50, siz: 60, dex: 70, app: 50, int: 50, pow: 50, edu: 50, luck: 50 }).mov).toBe(9);

    // default -> mov = 8
    expect(computeCocDerived({ str: 50, con: 50, siz: 60, dex: 70, app: 50, int: 50, pow: 50, edu: 50, luck: 50 }).mov).toBe(8);
  });
});
