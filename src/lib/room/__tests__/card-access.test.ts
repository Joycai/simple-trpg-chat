import { describe, expect, it } from "vitest";
import { canOpenMemberCard, countIncomplete } from "../card-access";

describe("canOpenMemberCard", () => {
  it("lets the host open any other member's card, bots included", () => {
    expect(canOpenMemberCard({ id: 1, isHost: true }, 2)).toBe(true);
    expect(canOpenMemberCard({ id: 1, isHost: true }, 7)).toBe(true);
  });

  it("gives players and the viewer's own row no entry", () => {
    expect(canOpenMemberCard({ id: 2, isHost: false }, 3)).toBe(false);
    expect(canOpenMemberCard({ id: 1, isHost: true }, 1)).toBe(false);
  });
});

describe("countIncomplete", () => {
  it("counts members with required fields left, skipping excluded ids", () => {
    const m = new Map([
      [1, { requiredTotal: 10, requiredSet: 3 }],
      [2, { requiredTotal: 10, requiredSet: 10 }],
      [3, { requiredTotal: 10, requiredSet: 0 }],
      [4, { requiredTotal: 0, requiredSet: 0 }],
    ]);
    expect(countIncomplete(m, [])).toBe(2);
    expect(countIncomplete(m, [1])).toBe(1);
  });
});
