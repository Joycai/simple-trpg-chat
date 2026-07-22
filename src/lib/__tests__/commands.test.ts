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
    })),
    delete: vi.fn(() => ({
      where: vi.fn()
    }))
  },
  sqlNow: vi.fn(() => "NOW()")
}));

vi.mock("@/db/schema", () => ({
  roomSkills: { id: "id", roomId: "roomId", userId: "userId", skillName: "skillName" },
  rooms: { id: "id" },
  roomMembers: { characterData: "characterData" }
}));

// Command feedback now flows through the central message router.
vi.mock("@/lib/messaging/router", () => ({
  dispatchMessage: vi.fn(async () => ({ id: 1 })),
  messageVisibilityWhere: vi.fn()
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    if (key === "keptLabel") return "保留";
    return key;
  })
}));

import { parseAndRollExpression, executeCommand, formatDiceRollMessage } from "../commands";
import { db } from "@/db";
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
    const regex = /^(help|st|rc|sc|rd|ra|rh|r)\s*(.*)$/i;

    const testCases = [
      { input: "st侦查50", cmd: "st", args: "侦查50" },
      { input: "st 侦查50", cmd: "st", args: "侦查50" },
      { input: "rc侦查", cmd: "rc", args: "侦查" },
      { input: "rc侦查90", cmd: "rc", args: "侦查90" },
      { input: "ra侦查60", cmd: "ra", args: "侦查60" },
      { input: "ra 侦查 60", cmd: "ra", args: "侦查 60" },
      { input: "ra侦查", cmd: "ra", args: "侦查" },
      { input: "sc0/1", cmd: "sc", args: "0/1" },
      { input: "help", cmd: "help", args: "" },
      { input: "rd100", cmd: "rd", args: "100" },
      { input: "rd", cmd: "rd", args: "" },
      // `rh` (hidden roll) must not be stolen by the `.r` dice command
      { input: "rh100", cmd: "rh", args: "100" },
      { input: "rh2d100k1", cmd: "rh", args: "2d100k1" },
      // `ra` / `rh` must not steal the `.r` dice command
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
  it("should fail with scNotCoc7th when ruleTemplate is basic", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "basic" }];
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
            return [{ id: 1, ruleTemplate: "coc7th" }];
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

describe("Commands - executeCommand (.rc / .ra are identical variants)", () => {
  it("should fail with rcUsageError when no skill is given", async () => {
    const result = await executeCommand(1, 1, ".ra");
    expect(result.success).toBe(false);
    expect(result.isCommand).toBe(true);
    expect(result.error).toBe("rcUsageError");
  });

  it("should report rcSkillNotSet when no value is given and skill/attribute is unset", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
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

  it("should roll a one-off check at the supplied value without persisting", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();
    const insertSpy = vi.spyOn(db, "insert");

    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
          }
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".rc侦查60");
    expect(result.success).toBe(true);
    expect(result.message).toBeDefined();
    // Spec: an inline value is a one-off check; it must NOT write to room_skills.
    expect(insertSpy).not.toHaveBeenCalled();

    // The dice detail should carry the target value and original command echo.
    const detail = JSON.parse(vi.mocked(dispatchMessage).mock.calls[0][0].diceDetail as string);
    expect(detail.check.target).toBe(60);
    expect(detail.command).toBe(".rc侦查60");
    insertSpy.mockRestore();
  });

  it("should fall back to a COC attribute when no skill row exists (.rc 体质)", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();

    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
          }
          if (table === roomMembers) {
            return [{ characterData: JSON.stringify({ ruleTemplate: "coc7th", cocAttributes: { con: 70 } }) }];
          }
          return []; // no roomSkills row
        })
      }))
    });

    const result = await executeCommand(1, 1, ".rc 体质");
    expect(result.success).toBe(true);
    const detail = JSON.parse(vi.mocked(dispatchMessage).mock.calls[0][0].diceDetail as string);
    expect(detail.check.skillName).toBe("体质");
    expect(detail.check.target).toBe(70);
  });
});

describe("Commands - hidden roll (.rh) and channel visibility", () => {
  it(".rh is visible only to the roller (audience=self)", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();

    const result = await executeCommand(1, 7, ".rh100");
    expect(result.success).toBe(true);
    const params = vi.mocked(dispatchMessage).mock.calls[0][0];
    expect(params.audience).toBe("self");
  });

  it(".rd in a public channel broadcasts to everyone", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();

    await executeCommand(1, 7, ".rd100");
    const params = vi.mocked(dispatchMessage).mock.calls[0][0];
    expect(params.audience).toBe("everyone");
    expect(params.targetUserId).toBeUndefined();
  });

  it(".rd issued inside a DM stays between the two participants", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();

    await executeCommand(1, 7, ".rd100", { isPrivate: true, targetUserId: 9 });
    const params = vi.mocked(dispatchMessage).mock.calls[0][0];
    expect(params.audience).toBe("dm");
    expect(params.targetUserId).toBe(9); // the DM partner (sender also sees it via canSee)
  });
});

describe("Commands - .st COC routing", () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
          }
          if (table === roomMembers) {
            return [{ characterData: JSON.stringify({ ruleTemplate: "coc7th", cocAttributes: { pow: 60 }, cocDerived: { sanMax: 60 } }) }];
          }
          return [];
        })
      }))
    });
  });

  it("routes an attribute to the character sheet, not room_skills", async () => {
    const insertSpy = vi.spyOn(db, "insert");
    const updateSpy = vi.spyOn(db, "update");
    insertSpy.mockClear();
    updateSpy.mockClear();

    const result = await executeCommand(1, 1, ".st 力量50");
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalled();   // character_data updated
    expect(insertSpy).not.toHaveBeenCalled(); // no room_skills row created
    insertSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("treats 外貌 / 魅力 / app as the same attribute", async () => {
    const { resolveCocStat } = await import("@/lib/rules/coc7th/stats");
    expect(resolveCocStat("外貌").canonical).toBe(resolveCocStat("魅力").canonical);
    expect(resolveCocStat("app").canonical).toBe(resolveCocStat("外貌").canonical);
    const r = resolveCocStat("魅力");
    expect(r.kind === "attribute" && r.key).toBe("app");
  });

  it("routes a resource (理智值) to the character sheet, not room_skills", async () => {
    const insertSpy = vi.spyOn(db, "insert");
    insertSpy.mockClear();
    const result = await executeCommand(1, 1, ".st 理智值40");
    expect(result.success).toBe(true);
    expect(insertSpy).not.toHaveBeenCalled();
    insertSpy.mockRestore();
  });
});

describe("Commands - .st on a fresh member (no sheet yet)", () => {
  beforeEach(() => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
          }
          if (table === roomMembers) {
            // Member exists but never opened the character panel.
            return [{ characterData: null }];
          }
          return [];
        })
      }))
    });
  });

  it("seeds a sheet via rule.initCharacter() and persists the attribute write", async () => {
    const updateSpy = vi.spyOn(db, "update");
    updateSpy.mockClear();

    const result = await executeCommand(1, 1, ".st 力量50");
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(roomMembers);

    const setFn = updateSpy.mock.results[0].value.set;
    const written = JSON.parse(setFn.mock.calls[0][0].characterData);
    expect(written.ruleTemplate).toBe("coc7th");
    expect(written.cocAttributes.str).toBe(50);
    updateSpy.mockRestore();
  });

  it("persists a resource write on a fresh sheet", async () => {
    const updateSpy = vi.spyOn(db, "update");
    updateSpy.mockClear();

    const result = await executeCommand(1, 1, ".st 理智值40");
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(roomMembers);

    const setFn = updateSpy.mock.results[0].value.set;
    const written = JSON.parse(setFn.mock.calls[0][0].characterData);
    expect(written.ruleTemplate).toBe("coc7th");
    updateSpy.mockRestore();
  });
});

describe("Commands - unknown command suggestions", () => {
  it("suggests the nearest command for a close typo", async () => {
    const result = await executeCommand(1, 1, ".halp");
    expect(result.success).toBe(false);
    expect(result.error).toBe("unknownCommandGuess");
  });

  it("falls back to the generic message for a far-off token", async () => {
    const result = await executeCommand(1, 1, ".zzzzzz");
    expect(result.success).toBe(false);
    expect(result.error).toBe("unknownCommand");
  });
});

describe("Commands - formatDiceRollMessage highlightFace stamping", () => {
  const t = (key: string) => key;

  it("stamps highlightFace into single-term detail when provided", () => {
    const res = parseAndRollExpression("6d4", t);
    expect(res.success).toBe(true);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 6d4", 3);
    const detail = JSON.parse(diceDetail);
    expect(detail.highlightFace).toBe(3);
    expect(detail.notation).toBe("6d4");
    expect(detail.results).toHaveLength(6);
  });

  it("omits highlightFace when the param is undefined", () => {
    const res = parseAndRollExpression("6d4", t);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 6d4");
    expect(JSON.parse(diceDetail)).not.toHaveProperty("highlightFace");
  });

  it("does not stamp compound expressions (results are empty there)", () => {
    const res = parseAndRollExpression("2d4+1d6", t);
    expect(res.success).toBe(true);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 2d4+1d6", 3);
    const detail = JSON.parse(diceDetail);
    expect(detail).not.toHaveProperty("highlightFace");
    expect(detail.results).toEqual([]);
  });

  it("keeps kN keep-highest detail intact alongside highlightFace", () => {
    const res = parseAndRollExpression("3d4k2", t);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 3d4k2", 3);
    const detail = JSON.parse(diceDetail);
    expect(detail.highlightFace).toBe(3);
    expect(detail.keptRolls).toHaveLength(2);
  });
});
