import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { parseRoomId } from "../room-lookup";

describe("parseRoomId", () => {
  it("accepts a positive int4", () => {
    expect(parseRoomId("1")).toBe(1);
    expect(parseRoomId("2147483647")).toBe(2147483647);
  });

  it("keeps parseInt's leading-digits reading", () => {
    expect(parseRoomId("12abc")).toBe(12);
  });

  it("rejects ids Postgres can't hold or no room can have", () => {
    for (const raw of ["abc", "", "0", "-3", "2147483648", "99999999999"]) {
      expect(parseRoomId(raw)).toBeNull();
    }
  });
});
