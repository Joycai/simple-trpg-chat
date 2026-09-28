import { describe, expect, it } from "vitest";
import { buildSkillRows, filterSkillRows, isNewSkillName, skillFilterCounts } from "../skill-list";
import { emptySheet } from "../sheet-v2";
import { testRule } from "./fixtures/test-rule";

const aliases = (n: string) => (n === "侦察" ? ["侦查"] : []);
const skills = [
  { id: 1, skillName: "侦察", skillValue: 60 },
  { id: 2, skillName: "梦境学", skillValue: 35 },
  { id: 3, skillName: "潜行", skillValue: 20 },
];

describe("buildSkillRows", () => {
  const rows = buildSkillRows(testRule, { ...emptySheet("fixture"), attributes: { dex: 70 } }, skills, aliases);

  it("lists standard skills in schema order, filled through aliases", () => {
    expect(rows.slice(0, 3).map((r) => [r.name, r.state, r.stored?.skillValue, r.base])).toEqual([
      ["侦查", "set", 60, 25],
      ["闪避", "default", undefined, 35],
      ["信用评级", "missing", undefined, 0],
    ]);
  });

  it("lists the rest as custom skills, sorted", () => {
    expect(rows.slice(3).map((r) => [r.name, r.kind, r.state])).toEqual([
      ["梦境学", "custom", "custom"],
      ["潜行", "custom", "custom"],
    ]);
  });

  it("prefers the exact-name row when both spellings are stored", () => {
    const both = buildSkillRows(testRule, emptySheet("fixture"),
      [{ id: 1, skillName: "侦察", skillValue: 60 }, { id: 2, skillName: "侦查", skillValue: 70 }], aliases);
    expect(both[0].stored?.skillValue).toBe(70);
  });

  it("filters and counts", () => {
    expect(skillFilterCounts(rows)).toEqual({ all: 5, set: 3, unset: 2, custom: 2 });
    expect(filterSkillRows(rows, "unset", "").map((r) => r.name)).toEqual(["闪避", "信用评级"]);
    expect(filterSkillRows(rows, "all", "梦").map((r) => r.name)).toEqual(["梦境学"]);
  });

  it("finds and refuses alias spellings of a listed skill", () => {
    expect(isNewSkillName(rows, "侦察", aliases)).toBe(false);
    const bothWays = (n: string) => (n === "侦查" ? ["侦察"] : n === "侦察" ? ["侦查"] : []);
    const stored = buildSkillRows(testRule, emptySheet("fixture"), [{ id: 1, skillName: "侦查", skillValue: 60 }], bothWays);
    expect(isNewSkillName(stored, "侦察", bothWays)).toBe(false);
    expect(filterSkillRows(stored, "all", "侦察", bothWays).map((r) => r.name)).toEqual(["侦查"]);
  });

  it("keeps a shadowed alias row visible as a custom row", () => {
    const both = buildSkillRows(testRule, emptySheet("fixture"),
      [{ id: 1, skillName: "侦察", skillValue: 50 }, { id: 2, skillName: "侦查", skillValue: 70 }], aliases);
    expect(both[0].stored?.id).toBe(2);
    expect(both.filter((r) => r.kind === "custom").map((r) => r.stored?.id)).toEqual([1]);
  });

  it("offers adding only genuinely new names", () => {
    expect(isNewSkillName(rows, "侦察")).toBe(false);
    expect(isNewSkillName(rows, "闪避")).toBe(false);
    expect(isNewSkillName(rows, "考古学")).toBe(true);
    expect(isNewSkillName(rows, "  ")).toBe(false);
  });
});
