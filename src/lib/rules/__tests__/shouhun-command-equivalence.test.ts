import { describe, it, expect } from "vitest";
import { shouhunRule } from "../shouhun";

// respondToCheckRequestAction used to hand-build the 狩魂者 responder command.
// It now calls shouhunRule.buildCheckCommand; this locks the two together at
// the parser: every command the old concatenation produced must parse to the
// same check as the builder's output.

/** The concatenation checks.ts used before switching to the rule module. */
function legacyCommand(name: string, x: number, y: number, dc: number): string {
  const group = x > 0 || y !== 0 ? `+${x}${y > 0 ? `+${y}` : y < 0 ? `${y}` : ""}` : "";
  return `.rc ${name}${group} ${dc}`;
}

function parse(command: string) {
  expect(command.startsWith(".rc ")).toBe(true);
  return shouhunRule.parseRcArgs(command.slice(".rc ".length));
}

// Request names arrive trimmed and capped at 50 (requestSkillCheckAction), but
// the cap can leave a trailing space. Names ending in a signed number are the
// case where `+0-y` and `-y` diverge.
const NAMES = ["侦查", "技能2", "侦查 ", "力量+5", "abc-1", "a".repeat(50)];
const XS = [0, 1, 3, 20];
const YS = [-3, -1, 0, 1, 3];
const DCS = [0, 10, 15, 999];

describe("shouhun responder command: legacy concatenation ⇔ buildCheckCommand", () => {
  for (const name of NAMES) {
    it(`parses identically for ${JSON.stringify(name)}`, () => {
      for (const x of XS) for (const y of YS) for (const dc of DCS) {
        const built = shouhunRule.buildCheckCommand!({ name, bonusDice: x, styleDice: y, dc, hidden: false });
        expect(built).not.toBeNull();
        const legacy = parse(legacyCommand(name, x, y, dc));
        const next = parse(built!.command);
        expect(next, `${name} x=${x} y=${y} dc=${dc}`).toEqual(legacy);
      }
    });
  }

  it("keeps a name ending in a signed number intact when only 时髦骰 is negative", () => {
    const built = shouhunRule.buildCheckCommand!({ name: "力量+5", bonusDice: 0, styleDice: -1, dc: 10, hidden: false })!;
    expect(parse(built.command)).toEqual({ skillName: "力量+5", explicitTarget: 10, modifierExpression: "-1d6" });
  });
});
