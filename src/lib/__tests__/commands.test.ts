import { describe, it, expect, vi } from "vitest";

// Mock dependencies to prevent Next.js server actions / NextAuth import errors in vitest environment
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [])
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn()
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn()
      }))
    }))
  },
  sqlNow: vi.fn(() => "NOW()")
}));

vi.mock("@/db/schema", () => ({
  roomSkills: { roomId: "roomId", userId: "userId", skillName: "skillName" },
  rooms: { id: "id" },
  roomMembers: { characterData: "characterData" }
}));

vi.mock("@/app/actions/room", () => ({
  rollDiceAction: vi.fn(),
  sendMessageAction: vi.fn()
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => async (key: string) => {
    if (key === "keptLabel") return "保留";
    return key;
  })
}));

import { parseAndRollExpression } from "../commands";

describe("Commands - parseAndRollExpression", () => {
  it("should parse and roll a simple d100 roll", () => {
    const res = parseAndRollExpression("d100");
    expect(res.success).toBe(true);
    expect(res.terms).toHaveLength(1);
    expect(res.terms[0].type).toBe("dice");
    expect(res.terms[0].count).toBe(1);
    expect(res.terms[0].faces).toBe(100);
    expect(res.terms[0].rolls).toHaveLength(1);
    expect(res.totalSum).toBe(res.terms[0].rolls[0]);
    expect(res.notation).toBe("1d100");
  });

  it("should parse and roll multiple dice like 2d100", () => {
    const res = parseAndRollExpression("2d100");
    expect(res.success).toBe(true);
    expect(res.terms).toHaveLength(1);
    expect(res.terms[0].count).toBe(2);
    expect(res.terms[0].faces).toBe(100);
    expect(res.terms[0].rolls).toHaveLength(2);
    expect(res.totalSum).toBe(res.terms[0].rolls[0] + res.terms[0].rolls[1]);
    expect(res.notation).toBe("2d100");
  });

  it("should support keep-highest k modifier like 3d100k2", () => {
    const res = parseAndRollExpression("3d100k2");
    expect(res.success).toBe(true);
    expect(res.terms).toHaveLength(1);
    const term = res.terms[0];
    expect(term.count).toBe(3);
    expect(term.faces).toBe(100);
    expect(term.keep).toBe(2);
    expect(term.rolls).toHaveLength(3);
    expect(term.keptRolls).toHaveLength(2);

    // Verify keptRolls are the highest 2
    const sorted = [...term.rolls].sort((a, b) => b - a);
    expect(term.keptRolls[0]).toBe(sorted[0]);
    expect(term.keptRolls[1]).toBe(sorted[1]);
    expect(res.totalSum).toBe(sorted[0] + sorted[1]);
    expect(res.notation).toBe("3d100k2");
  });

  it("should support compound dice expressions like 3d100k2+2d20-1d6+5", () => {
    const res = parseAndRollExpression("3d100k2+2d20-1d6+5");
    expect(res.success).toBe(true);
    expect(res.terms).toHaveLength(4);

    expect(res.terms[0].type).toBe("dice");
    expect(res.terms[0].count).toBe(3);
    expect(res.terms[0].faces).toBe(100);
    expect(res.terms[0].keep).toBe(2);
    expect(res.terms[0].sign).toBe("+");

    expect(res.terms[1].type).toBe("dice");
    expect(res.terms[1].count).toBe(2);
    expect(res.terms[1].faces).toBe(20);
    expect(res.terms[1].sign).toBe("+");

    expect(res.terms[2].type).toBe("dice");
    expect(res.terms[2].count).toBe(1);
    expect(res.terms[2].faces).toBe(6);
    expect(res.terms[2].sign).toBe("-");

    expect(res.terms[3].type).toBe("constant");
    expect(res.terms[3].sum).toBe(5);
    expect(res.terms[3].sign).toBe("+");

    // Recompute sum manually to verify signs
    const expectedSum = res.terms[0].sum + res.terms[1].sum - res.terms[2].sum + 5;
    expect(res.totalSum).toBe(expectedSum);
    expect(res.notation).toBe("3d100k2 + 2d20 - 1d6 + 5");
  });

  it("should return false on invalid expression", () => {
    const res = parseAndRollExpression("3d100k2+abc");
    expect(res.success).toBe(false);
  });

  it("should validate command prefix matching regex", () => {
    const regex = /^(help|st|rc|sc|rd|r)\s*(.*)$/i;

    const testCases = [
      { input: "st侦查50", cmd: "st", args: "侦查50" },
      { input: "st 侦查50", cmd: "st", args: "侦查50" },
      { input: "rc侦查", cmd: "rc", args: "侦查" },
      { input: "sc0/1", cmd: "sc", args: "0/1" },
      { input: "help", cmd: "help", args: "" },
      { input: "rd100", cmd: "rd", args: "100" },
      { input: "rd", cmd: "rd", args: "" },
      { input: "r2d100", cmd: "r", args: "2d100" },
      { input: "r3d100k2+2d20+1d6", cmd: "r", args: "3d100k2+2d20+1d6" },
    ];

    for (const { input, cmd, args } of testCases) {
      const match = input.match(regex);
      expect(match).not.toBeNull();
      expect(match![1].toLowerCase()).toBe(cmd);
      expect(match![2]).toBe(args);
    }
  });

  it("should match sanity check expressions with minus sign", () => {
    const scRegex = /^([0-9a-zA-Z+-d\s]+)\s*\/\s*([0-9a-zA-Z+-d\s]+)$/i;
    
    const validCases = [
      "0/1d6",
      "1d3-1/1d6",
      "1d6-2/1d10-1d2",
      "1d6 + 1 / 1d20 - 5"
    ];

    for (const testCase of validCases) {
      const match = testCase.match(scRegex);
      expect(match).not.toBeNull();
    }
  });
});
