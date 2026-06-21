import { describe, it, expect } from "vitest";
import { parseLoginDate } from "@/components/user/UserLoginHistory";

describe("UserLoginHistory - parseLoginDate helper", () => {
  it("should parse standard ISO strings with T and Z", () => {
    const d = parseLoginDate("2026-06-11T04:08:20.000Z");
    expect(d.toISOString()).toBe("2026-06-11T04:08:20.000Z");
  });

  it("should parse PostgreSQL timestamps with space and positive offset", () => {
    const d = parseLoginDate("2026-06-11 12:08:20.123+08");
    expect(d.getTime()).toBe(new Date("2026-06-11T12:08:20.123+08:00").getTime());
  });

  it("should parse PostgreSQL timestamps with space and UTC Z", () => {
    const d = parseLoginDate("2026-06-11 04:08:20.123Z");
    expect(d.toISOString()).toBe("2026-06-11T04:08:20.123Z");
  });

  it("should parse SQLite-style local timestamps without offset by appending Z", () => {
    const d = parseLoginDate("2026-06-11 04:08:20");
    expect(d.toISOString()).toBe("2026-06-11T04:08:20.000Z");
  });

  it("should return a valid date for empty string or invalid string as fallback", () => {
    const d = parseLoginDate("");
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });
});
