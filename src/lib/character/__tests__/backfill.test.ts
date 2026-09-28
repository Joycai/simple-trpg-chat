import { describe, expect, it } from "vitest";
import { planSheetBackfill, type BackfillRow } from "../backfill";

const row = (memberId: number, characterData: string | null, roomRule = "coc7th"): BackfillRow =>
  ({ memberId, roomId: 1, userId: memberId, roomRule, characterData });
const coc = { str: 70, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 };

describe("planSheetBackfill", () => {
  it("upgrades legacy rows and reports the rest", () => {
    const plan = planSheetBackfill([
      row(1, JSON.stringify({ ruleTemplate: "coc7th", cocAttributes: coc })),
      row(2, JSON.stringify({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: {}, resources: {} })),
      row(3, null),
      row(4, "{broken"),
      row(5, JSON.stringify({ ruleTemplate: "dnd5e", d20Attributes: { str: 16 } })),
    ]);
    expect(plan.updates.map((u) => u.memberId)).toEqual([1, 5]);
    // The write is conditional on the row still holding what was read.
    expect(plan.updates[0].from).toBe(JSON.stringify({ ruleTemplate: "coc7th", cocAttributes: coc }));
    expect(JSON.parse(plan.updates[0].characterData)).toMatchObject({ schemaVersion: 2, attributes: { str: 70 } });
    expect(plan.report).toMatchObject({
      total: 5, empty: 1, alreadyV2: 1, upgraded: 2, ruleMismatch: 1,
      unreadable: [{ memberId: 4 }], byRule: { coc7th: 1, dnd5e: 1 },
    });
  });

  it("is idempotent: a planned row plans nothing the second time", () => {
    const first = planSheetBackfill([row(1, JSON.stringify({ ruleTemplate: "coc7th", cocAttributes: coc }))]);
    const second = planSheetBackfill([row(1, first.updates[0].characterData)]);
    expect(second.updates).toEqual([]);
    expect(second.report.alreadyV2).toBe(1);
  });
});
