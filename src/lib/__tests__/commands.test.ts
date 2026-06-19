import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies to prevent Next.js server actions / NextAuth import errors in vitest environment
const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn()
}));

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
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
  sendMessageAction: vi.fn(async () => ({ id: 1 }))
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    if (key === "keptLabel") return "保留";
    return key;
  })
}));

import { parseAndRollExpression, executeCommand } from "../commands";
import { rooms, roomSkills, roomMembers } from "@/db/schema";

beforeEach(() => {
  mockSelect.mockReset();
  mockSelect.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => [])
    }))
  });
});

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
    const regex = /^(help|st|rc|sc|rd|ra|r)\s*(.*)$/i;

    const testCases = [
      { input: "st侦查50", cmd: "st", args: "侦查50" },
      { input: "st 侦查50", cmd: "st", args: "侦查50" },
      { input: "rc侦查", cmd: "rc", args: "侦查" },
      { input: "ra侦查60", cmd: "ra", args: "侦查60" },
      { input: "ra 侦查 60", cmd: "ra", args: "侦查 60" },
      { input: "ra侦查", cmd: "ra", args: "侦查" },
      { input: "sc0/1", cmd: "sc", args: "0/1" },
      { input: "help", cmd: "help", args: "" },
      { input: "rd100", cmd: "rd", args: "100" },
      { input: "rd", cmd: "rd", args: "" },
      // `ra` must not steal the `.r` dice command
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

describe("Commands - executeCommand (.sc)", () => {
  it("should fail with scNotCoc7th if room.ruleTemplate is not coc7th", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "basic", diceRules: "coc7th" }];
          }
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".sc 0/1d6");
    expect(result.success).toBe(false);
    expect(result.isCommand).toBe(true);
    expect(result.error).toBe("scNotCoc7th");
  });

  it("should succeed and roll check if room.ruleTemplate is coc7th", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th", diceRules: "basic" }];
          }
          if (table === roomSkills) {
            return [{ roomId: 1, userId: 1, skillName: "理智值", skillValue: 50 }];
          }
          if (table === roomMembers) {
            return [{ characterData: JSON.stringify({ ruleTemplate: "coc7th", cocDerived: { san: 50, sanMax: 99 } }) }];
          }
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".sc 0/1d6");
    expect(result.success).toBe(true);
    expect(result.isCommand).toBe(true);
    expect(result.message).toBeDefined();
  });
});

describe("Commands - executeCommand (.ra)", () => {
  it("should fail with raUsageError when no skill is given", async () => {
    const result = await executeCommand(1, 1, ".ra");
    expect(result.success).toBe(false);
    expect(result.isCommand).toBe(true);
    expect(result.error).toBe("raUsageError");
  });

  it("should delegate to .rc (rcSkillNotSet) when no value is given and skill is unset", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th", diceRules: "coc7th" }];
          }
          return []; // roomSkills empty → skill not set
        })
      }))
    });

    const result = await executeCommand(1, 1, ".ra侦查");
    expect(result.success).toBe(false);
    expect(result.isCommand).toBe(true);
    expect(result.error).toBe("rcSkillNotSet");
  });

  it("should set the skill and roll a check when a value is given", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th", diceRules: "coc7th" }];
          }
          // upsert is a mocked no-op; performSkillCheck uses the passed value, no read-back
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".ra侦查60");
    expect(result.success).toBe(true);
    expect(result.isCommand).toBe(true);
    expect(result.message).toBeDefined();
  });
});
