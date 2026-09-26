import { describe, it, expect } from "vitest";
import { shouhunRule } from "../shouhun";

// respondToCheckRequestAction used to hand-build the 狩魂者 responder command
// and now gets it from shouhunRule.buildCheckCommand. Two properties hold:
//  - for ordinary names, every command the old concatenation produced parses
//    to the same check as the builder's output;
//  - for every name, including ones ending in a signed number (`力量+5`),
//    the builder's command parses back to that exact name and dice — which the
//    old concatenation got wrong for such names.

/** The concatenation checks.ts used before switching to the rule module. */
function legacyCommand(name: string, x: number, y: number, dc: number): string {
  const group = x > 0 || y !== 0 ? `+${x}${y > 0 ? `+${y}` : y < 0 ? `${y}` : ""}` : "";
  return `.rc ${name}${group} ${dc}`;
}

function parse(command: string) {
  expect(command.startsWith(".rc ")).toBe(true);
  return shouhunRule.parseRcArgs(command.slice(".rc ".length));
}

function build(name: string, x: number, y: number, dc: number) {
  const built = shouhunRule.buildCheckCommand!({ name, bonusDice: x, styleDice: y, dc, hidden: false });
  expect(built).not.toBeNull();
  return built!.command;
}

/** The modifier the parser should derive for x 加骰 d4 and y 时髦骰 d6. */
function expectedModifier(x: number, y: number): string | undefined {
  const parts: string[] = [];
  if (x > 0) parts.push(`+${x}d4`);
  if (y > 0) parts.push(`+${y}d6`);
  if (y < 0) parts.push(`-${-y}d6`);
  return parts.length ? parts.join("") : undefined;
}

// Request names arrive trimmed and capped at 50 (requestSkillCheckAction), but
// the cap can leave a trailing space.
const ORDINARY_NAMES = ["侦查", "技能2", "侦查 ", "a".repeat(50)];
const SIGNED_SUFFIX_NAMES = ["力量+5", "abc-1", "a+1+2", "x+123", "技能-20"];
const XS = [0, 1, 3, 20];
const YS = [-3, -1, 0, 1, 3];
const DCS = [0, 10, 15, 999];

describe("shouhun responder command: legacy concatenation ⇔ buildCheckCommand", () => {
  for (const name of ORDINARY_NAMES) {
    it(`parses identically for ${JSON.stringify(name)}`, () => {
      for (const x of XS) for (const y of YS) for (const dc of DCS) {
        expect(parse(build(name, x, y, dc)), `${name} x=${x} y=${y} dc=${dc}`)
          .toEqual(parse(legacyCommand(name, x, y, dc)));
      }
    });
  }
});

describe("shouhun buildCheckCommand: the parser recovers name and dice", () => {
  for (const name of [...ORDINARY_NAMES, ...SIGNED_SUFFIX_NAMES]) {
    it(`round-trips ${JSON.stringify(name)}`, () => {
      for (const x of XS) for (const y of YS) for (const dc of DCS) {
        expect(parse(build(name, x, y, dc)), `${name} x=${x} y=${y} dc=${dc}`)
          .toEqual({ skillName: name.trim(), explicitTarget: dc, modifierExpression: expectedModifier(x, y) });
      }
    });
  }

  it("spells out both groups only for a name ending in a signed number", () => {
    expect(build("力量+5", 0, 0, 10)).toBe(".rc 力量+5+0+0 10");
    expect(build("力量+5", 2, 0, 10)).toBe(".rc 力量+5+2+0 10");
    expect(build("力量+5", 0, -1, 10)).toBe(".rc 力量+5+0-1 10");
    expect(build("侦查", 0, 0, 10)).toBe(".rc 侦查 10");
    expect(build("侦查", 2, 0, 10)).toBe(".rc 侦查+2 10");
  });

  it("re-trims a name the 50-char cap cuts after a space", () => {
    const long = `${"a".repeat(47)}+5 zz`;
    expect(parse(build(long, 0, 0, 10))).toEqual({ skillName: `${"a".repeat(47)}+5`, explicitTarget: 10, modifierExpression: undefined });
  });
});
