import { describe, expect, it } from "vitest";
import { formatClockTime, formatMonthDay, formatMonthDayTime } from "@/lib/format/time";

// Expected values are built from local-time Date getters so the assertions hold
// in any TZ the suite runs under.
const local = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi).toISOString();

describe("formatClockTime", () => {
  it("zero-pads single-digit hours and minutes", () => {
    expect(formatClockTime(local(2026, 3, 5, 7, 4))).toBe("07:04");
  });
  it("renders a two-digit afternoon time", () => {
    expect(formatClockTime(local(2026, 10, 14, 14, 20))).toBe("14:20");
  });
  it("converts an offset-bearing ISO string to local time", () => {
    const iso = "2026-10-14T22:07:00+08:00";
    const d = new Date(iso);
    const expected = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    expect(formatClockTime(iso)).toBe(expected);
  });
  it("returns an empty string for an unparseable input", () => {
    expect(formatClockTime("not a date")).toBe("");
  });
});

describe("formatMonthDay", () => {
  it("zero-pads single-digit month and day", () => {
    expect(formatMonthDay(local(2026, 1, 2, 12, 0))).toBe("01-02");
  });
  it("drops the year across a year boundary", () => {
    expect(formatMonthDay(local(2025, 12, 31, 23, 59))).toBe("12-31");
    expect(formatMonthDay(local(2026, 1, 1, 0, 0))).toBe("01-01");
  });
  it("converts an offset-bearing ISO string to local time", () => {
    const iso = "2026-10-14T22:07:00-05:00";
    const d = new Date(iso);
    const expected = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(formatMonthDay(iso)).toBe(expected);
  });
  it("returns an empty string for an unparseable input", () => {
    expect(formatMonthDay("")).toBe("");
  });
});

describe("formatMonthDayTime", () => {
  it("zero-pads every field", () => {
    expect(formatMonthDayTime(local(2026, 3, 5, 7, 4))).toBe("03-05 07:04");
  });
  it("renders a full two-digit stamp", () => {
    expect(formatMonthDayTime(local(2026, 10, 14, 22, 7))).toBe("10-14 22:07");
  });
  it("drops the year across a year boundary", () => {
    expect(formatMonthDayTime(local(2025, 12, 31, 23, 59))).toBe("12-31 23:59");
  });
  it("returns an empty string for an unparseable input", () => {
    expect(formatMonthDayTime("garbage")).toBe("");
  });
});
