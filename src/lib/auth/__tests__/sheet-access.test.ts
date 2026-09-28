import { describe, expect, it, vi } from "vitest";

// The decision under test is pure; stub the session and DB modules so the
// async resolver's imports don't load next-auth / a real connection.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
import { sheetWriteDenial, type SheetWriteFacts } from "../sheet-access";

const base: SheetWriteFacts = {
  callerId: 2, callerRole: "player",
  room: { hostId: 1, frozen: false },
  callerIsMember: true, targetId: 2, targetIsMember: true,
};
const deny = (patch: Partial<SheetWriteFacts>) => sheetWriteDenial({ ...base, ...patch });

describe("sheetWriteDenial", () => {
  it("lets a member write their own sheet", () => {
    expect(deny({})).toBeNull();
  });

  it("refuses a member writing someone else's sheet", () => {
    expect(deny({ targetId: 3 })).toBe("errorUnauthorizedResource");
  });

  it("lets the host and an admin write any member's sheet", () => {
    expect(deny({ callerId: 1, targetId: 3 })).toBeNull();
    expect(deny({ callerRole: "admin", targetId: 3 })).toBeNull();
  });

  it("lets an admin act without being a member", () => {
    expect(deny({ callerRole: "admin", callerIsMember: false, targetId: 3 })).toBeNull();
    expect(deny({ callerIsMember: false })).toBe("errorNotMember");
  });

  it("keeps a frozen room read-only for everyone but the host and admins", () => {
    const frozen = { room: { hostId: 1, frozen: true } };
    expect(deny(frozen)).toBe("errorRoomFrozen");
    expect(deny({ ...frozen, callerId: 1, targetId: 3 })).toBeNull();
    expect(deny({ ...frozen, callerRole: "admin" })).toBeNull();
  });

  it("needs the room and the target member to exist", () => {
    expect(deny({ room: null })).toBe("errorRoomNotFound");
    expect(deny({ callerId: 1, targetId: 3, targetIsMember: false })).toBe("errorTargetNotMember");
  });
});
