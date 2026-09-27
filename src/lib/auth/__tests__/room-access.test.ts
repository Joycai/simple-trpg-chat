import { describe, it, expect, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));

import { isRoomHostOrAdmin } from "../room-access";

describe("isRoomHostOrAdmin", () => {
  const room = { hostId: 1 };
  it("is true for the room's host", () => {
    expect(isRoomHostOrAdmin(room, { id: 1, role: "host" })).toBe(true);
  });
  it("is true for any admin, member or not", () => {
    expect(isRoomHostOrAdmin(room, { id: 9, role: "admin" })).toBe(true);
  });
  it("is false for another host or a player", () => {
    expect(isRoomHostOrAdmin(room, { id: 2, role: "host" })).toBe(false);
    expect(isRoomHostOrAdmin(room, { id: 3, role: "player" })).toBe(false);
  });
});
