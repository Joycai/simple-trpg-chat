import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies to prevent Next.js server actions / NextAuth import errors in vitest environment
const { mockSelect, lockedReads } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  /** Tables read with `FOR UPDATE` inside a transaction, in order. */
  lockedReads: [] as unknown[],
}));

vi.mock("@/db", () => {
  const db = {
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
    })),
    // Sheet writes lock the member row (`updateSheetRow`): the transaction runs
    // inline, and its `select … for("update")` resolves through `mockSelect`.
    // `where()` resolves to the rows as-is and also takes `.for()`, like Drizzle.
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      select: (...a: unknown[]) => {
        const q = mockSelect(...a);
        return {
          from: (t: unknown) => ({
            where: (...w: unknown[]) => {
              const rows = q.from(t).where(...w);
              return Object.assign(Promise.resolve(rows), { for: () => { lockedReads.push(t); return rows; } });
            },
          }),
        };
      },
      update: (...a: unknown[]) => db.update(...(a as [])),
    })),
  };
  return { db, sqlNow: vi.fn(() => "NOW()") };
});

vi.mock("@/db/schema", () => ({
  roomSkills: { id: "id", roomId: "roomId", userId: "userId", skillName: "skillName" },
  rooms: { id: "id" },
  roomMembers: { id: "id", characterData: "characterData" }
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

vi.mock("@/lib/server/events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/events")>()),
  broadcastToRoom: vi.fn(),
}));

import { executeCommand } from "../engine";
import { broadcastToRoom } from "@/lib/server/events";
import { parseAndRollExpression, formatDiceRollMessage } from "../expression";
import { db } from "@/db";
import { rooms, roomSkills, roomMembers } from "@/db/schema";

beforeEach(() => {
  lockedReads.length = 0;
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

describe("Commands - executeCommand (.sc under the row lock)", () => {
  it("rolls against the locked SAN and stores old − loss, matching the card", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    const set = vi.fn(() => ({ where: vi.fn() }));
    vi.mocked(db.update).mockImplementationOnce((() => ({ set })) as never);
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) return [{ id: 1, ruleTemplate: "coc7th" }];
          if (table === roomMembers) {
            return [{ id: 9, characterData: JSON.stringify({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: { pow: 60 }, resources: { san: { current: 30 } } }) }];
          }
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".sc 1/5");
    expect(result.success).toBe(true);
    // The only sheet read is the locked one (the broadcast locks the row again).
    expect(lockedReads.filter((t) => t === roomMembers)).toHaveLength(2);
    const detail = JSON.parse(vi.mocked(dispatchMessage).mock.calls.at(-1)![0].diceDetail as string);
    const { oldSanity, newSanity, isSuccess } = detail.sanityCheck;
    expect(oldSanity).toBe(30);
    expect(detail.check.target).toBe(30);
    expect(newSanity).toBe(30 - (isSuccess ? 1 : 5));
    const stored = JSON.parse((set.mock.calls.at(-1) as unknown as [{ characterData: string }])[0].characterData);
    expect(stored.resources.san.current).toBe(newSanity);
  });

  it("tags the broadcast with the caller's tab, or the host's for a proxy roll", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(async () => {
          if (table === rooms) return [{ id: 1, ruleTemplate: "coc7th" }];
          if (table === roomMembers) {
            return [{ id: 9, characterData: JSON.stringify({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: { pow: 60 }, resources: { san: { current: 30 } } }) }];
          }
          return [];
        })
      }))
    });
    const origins = () => vi.mocked(broadcastToRoom).mock.calls
      .map(([, p]) => p as { type: string; origin?: unknown })
      .filter((p) => p.type === "character_updated")
      .map((p) => p.origin);

    vi.mocked(broadcastToRoom).mockClear();
    await executeCommand(1, 1, ".sc 1/5", { origin: "tab-9" });
    expect(origins()).toEqual(["1:tab-9"]);

    vi.mocked(broadcastToRoom).mockClear();
    await executeCommand(1, 1, ".sc 1/5", { origin: "tab-9", proxiedBy: { userId: 4, nickname: "KP" } });
    expect(origins()).toEqual(["4:tab-9"]);
  });
});

describe("Commands - executeCommand (.sc without sanity on the sheet)", () => {
  const roomWith = (rows: { members?: unknown[]; skills?: unknown[] }) => mockSelect.mockReturnValue({
    from: vi.fn((table) => ({
      where: vi.fn(() => {
        if (table === rooms) return [{ id: 1, ruleTemplate: "coc7th" }];
        if (table === roomMembers) return rows.members ?? [];
        if (table === roomSkills) return rows.skills ?? [];
        return [];
      })
    }))
  });

  it("falls back to a legacy 理智值 row for a non-member and writes no sheet", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    roomWith({ skills: [{ id: 4, roomId: 1, userId: 1, skillName: "理智值", skillValue: 40 }] });
    vi.mocked(db.update).mockClear();
    const result = await executeCommand(1, 1, ".sc 2/3");
    expect(result.success).toBe(true);
    const { oldSanity, newSanity, isSuccess } = JSON.parse(vi.mocked(dispatchMessage).mock.calls.at(-1)![0].diceDetail as string).sanityCheck;
    expect(oldSanity).toBe(40);
    expect(newSanity).toBe(40 - (isSuccess ? 2 : 3));
    expect(db.update).toHaveBeenCalledTimes(1); // the legacy row only
  });

  it("reports STAT_NOT_SET when neither the sheet nor a legacy row has sanity", async () => {
    // A sheet whose own rule has no sanity (built for basic, room now COC).
    roomWith({ members: [{ id: 9, characterData: JSON.stringify({ schemaVersion: 2, ruleTemplate: "basic", attributes: {}, resources: {} }) }] });
    const result = await executeCommand(1, 1, ".sc 1/5");
    expect(result).toMatchObject({ success: false, code: "STAT_NOT_SET", error: "scNoSanity" });
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

  it("should resolve a skill alias when the stored skill uses a different spelling (.rc 侦察 → 侦查 row)", async () => {
    const { dispatchMessage } = await import("@/lib/messaging/router");
    vi.mocked(dispatchMessage).mockClear();

    mockSelect.mockReturnValue({
      from: vi.fn((table) => ({
        where: vi.fn(() => {
          if (table === rooms) {
            return [{ id: 1, ruleTemplate: "coc7th" }];
          }
          if (table === roomSkills) {
            // Single inArray query over name + aliases: only the alias-spelled
            // "侦查" row exists; the engine picks it by candidate priority.
            return [{ roomId: 1, userId: 1, skillName: "侦查", skillValue: 65 }];
          }
          return [];
        })
      }))
    });

    const result = await executeCommand(1, 1, ".rc 侦察");
    expect(result.success).toBe(true);
    const detail = JSON.parse(vi.mocked(dispatchMessage).mock.calls[0][0].diceDetail as string);
    // Displays the actually-stored skill name, not the typed alias.
    expect(detail.check.skillName).toBe("侦查");
    expect(detail.check.target).toBe(65);
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

    vi.mocked(broadcastToRoom).mockClear();
    const result = await executeCommand(1, 1, ".st 力量50", { origin: "tab-9" });
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalled();   // character_data updated
    expect(broadcastToRoom).toHaveBeenCalledWith(1, expect.objectContaining({ type: "character_updated", origin: "1:tab-9" }));
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

  it("starts an empty sheet for the room's rule and persists the attribute write", async () => {
    const updateSpy = vi.spyOn(db, "update");
    updateSpy.mockClear();

    const result = await executeCommand(1, 1, ".st 力量50");
    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(roomMembers);

    const setFn = updateSpy.mock.results[0].value.set;
    const written = JSON.parse(setFn.mock.calls[0][0].characterData);
    expect(written).toEqual({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 50 }, resources: {}, rev: 1 });
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
    expect(written).toMatchObject({ ruleTemplate: "coc7th", resources: { san: { current: 40 } } });
    updateSpy.mockRestore();
  });
});

describe("Commands - .st on a v2 sheet", () => {
  const withSheet = (sheet: object) => mockSelect.mockReturnValue({
    from: vi.fn((table) => ({
      where: vi.fn(() => {
        if (table === rooms) return [{ id: 1, ruleTemplate: "coc7th" }];
        if (table === roomMembers) return [{ characterData: JSON.stringify(sheet) }];
        return [];
      })
    }))
  });

  it("reports the clamped value it stored", async () => {
    withSheet({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: {}, resources: {} });
    const updateSpy = vi.spyOn(db, "update");
    updateSpy.mockClear();
    const result = await executeCommand(1, 1, ".st 理智值150");
    expect(result.success).toBe(true);
    const written = JSON.parse(updateSpy.mock.results[0].value.set.mock.calls[0][0].characterData);
    expect(written.resources.san).toEqual({ current: 99 });
    updateSpy.mockRestore();
  });

  it("refuses attribute writes to a sheet built for another rule", async () => {
    withSheet({ schemaVersion: 2, ruleTemplate: "dnd5e", attributes: { str: 12 }, resources: {} });
    const updateSpy = vi.spyOn(db, "update");
    updateSpy.mockClear();
    const result = await executeCommand(1, 1, ".st 意志60");
    expect(result).toMatchObject({ success: false, error: "stSheetRuleMismatch" });
    expect(updateSpy).not.toHaveBeenCalled();
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

// The `terms` array powers the structured chat renderer (Sample 1: per-term
// count highlight + kept/dropped dice). It must appear on BOTH single-term and
// compound detail, carry keep + keptRolls, and encode constants compactly.
describe("Commands - formatDiceRollMessage structured `terms`", () => {
  const t = (key: string) => key;

  it("emits a single dice term with count/faces/rolls (no keep key when absent)", () => {
    const res = parseAndRollExpression("2d6", t);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 2d6");
    const detail = JSON.parse(diceDetail);
    expect(detail.terms).toHaveLength(1);
    const term = detail.terms[0];
    expect(term).toMatchObject({ sign: "+", count: 2, faces: 6 });
    expect(term.rolls).toHaveLength(2);
    expect(term.keptRolls).toHaveLength(2);
    expect(term).not.toHaveProperty("keep");
  });

  it("carries keep + a shorter keptRolls for kN keep-highest terms", () => {
    const res = parseAndRollExpression("3d100k2", t);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 3d100k2");
    const term = JSON.parse(diceDetail).terms[0];
    expect(term.keep).toBe(2);
    expect(term.rolls).toHaveLength(3);
    expect(term.keptRolls).toHaveLength(2);
  });

  it("emits one entry per term for compound expressions, with signs and a constant", () => {
    const res = parseAndRollExpression("3d100k2+2d20-1d6+5", t);
    const { diceDetail } = formatDiceRollMessage(res.notation, res.terms, res.totalSum, t, ".r 3d100k2+2d20-1d6+5");
    const detail = JSON.parse(diceDetail);
    expect(detail.results).toEqual([]); // compound keeps results empty…
    expect(detail.terms).toHaveLength(4); // …but the structured terms are present
    expect(detail.terms[0]).toMatchObject({ sign: "+", count: 3, faces: 100, keep: 2 });
    expect(detail.terms[1]).toMatchObject({ sign: "+", count: 2, faces: 20 });
    expect(detail.terms[2]).toMatchObject({ sign: "-", count: 1, faces: 6 });
    expect(detail.terms[3]).toEqual({ sign: "+", constant: 5 });
    expect(detail.terms[3]).not.toHaveProperty("faces");
  });
});
