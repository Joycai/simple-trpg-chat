import { describe, it, expect } from "vitest";
import { dayPartFromDivider, sanitizeTimelineDivider, parseTimelinePayload, buildTimelinePayload } from "@/lib/messaging/timeline-payload";
import type { TimelineDividerData } from "@/lib/messaging/timeline-payload";

const seg = (segment: TimelineDividerData["segment"]): TimelineDividerData => ({
  mode: "day", day: 1, timeMode: "segment", segment,
});
const clock = (c: string): TimelineDividerData => ({
  mode: "day", day: 1, timeMode: "clock", clock: c,
});

describe("dayPartFromDivider", () => {
  it("maps segments directly", () => {
    expect(dayPartFromDivider(seg("morning"))).toBe("morning");
    expect(dayPartFromDivider(seg("afternoon"))).toBe("afternoon");
    expect(dayPartFromDivider(seg("night"))).toBe("night");
  });

  it("buckets clock hours: 06:00–11:59 morning", () => {
    expect(dayPartFromDivider(clock("06:00"))).toBe("morning");
    expect(dayPartFromDivider(clock("09:30"))).toBe("morning");
    expect(dayPartFromDivider(clock("11:59"))).toBe("morning");
  });

  it("buckets clock hours: 12:00–17:59 afternoon", () => {
    expect(dayPartFromDivider(clock("12:00"))).toBe("afternoon");
    expect(dayPartFromDivider(clock("17:59"))).toBe("afternoon");
  });

  it("buckets clock hours: 18:00–05:59 night (wraps midnight)", () => {
    expect(dayPartFromDivider(clock("18:00"))).toBe("night");
    expect(dayPartFromDivider(clock("23:15"))).toBe("night");
    expect(dayPartFromDivider(clock("00:00"))).toBe("night");
    expect(dayPartFromDivider(clock("05:59"))).toBe("night");
  });

  it("returns null when no usable time is present", () => {
    expect(dayPartFromDivider(null)).toBeNull();
    expect(dayPartFromDivider(seg(null))).toBeNull();
    expect(dayPartFromDivider({ mode: "custom", custom: "黎明前", timeMode: "segment" })).toBeNull();
    expect(dayPartFromDivider({ mode: "date", date: "1925-08-14", timeMode: "clock", clock: null })).toBeNull();
    expect(dayPartFromDivider(clock("bad"))).toBeNull();
  });
});

describe("sanitizeTimelineDivider — the write-path gate", () => {
  const ok = (over: Partial<TimelineDividerData> = {}): unknown => ({
    mode: "day", day: 1, timeMode: "segment", segment: "morning", ...over,
  });

  it("passes well-formed payloads through, normalized", () => {
    expect(sanitizeTimelineDivider(ok())).toEqual({
      mode: "day", day: 1, timeMode: "segment", segment: "morning",
    });
    expect(sanitizeTimelineDivider({ mode: "date", date: "2026-07-25", timeMode: "clock", clock: "18:30" }))
      .toEqual({ mode: "date", date: "2026-07-25", timeMode: "clock", clock: "18:30" });
  });

  it("drops fields that do not belong to the chosen mode", () => {
    const out = sanitizeTimelineDivider({ ...(ok() as object), date: "2026-01-01", clock: "10:00" });
    expect(out).toEqual({ mode: "day", day: 1, timeMode: "segment", segment: "morning" });
  });

  it("rejects a non-string `custom` (used to crash composeTimelineLabel)", () => {
    expect(sanitizeTimelineDivider({ mode: "custom", custom: {}, timeMode: "segment", segment: "night" })).toBeNull();
    expect(sanitizeTimelineDivider({ mode: "custom", custom: "   ", timeMode: "segment", segment: "night" })).toBeNull();
  });

  it("truncates an over-long custom label to 100 chars", () => {
    const out = sanitizeTimelineDivider({ mode: "custom", custom: "x".repeat(250), timeMode: "segment", segment: "night" });
    expect(out?.custom).toHaveLength(100);
  });

  it("rejects a missing or out-of-enum timeMode", () => {
    expect(sanitizeTimelineDivider({ mode: "day", day: 1 })).toBeNull();
    expect(sanitizeTimelineDivider(ok({ timeMode: "whenever" as never }))).toBeNull();
  });

  it("rejects an out-of-enum mode or segment", () => {
    expect(sanitizeTimelineDivider(ok({ mode: "epoch" as never }))).toBeNull();
    expect(sanitizeTimelineDivider(ok({ segment: "dusk" as never }))).toBeNull();
  });

  it("rejects malformed clock values", () => {
    for (const clock of ["24:00", "7:30", "18:60", "1830", ""]) {
      expect(sanitizeTimelineDivider({ mode: "day", day: 1, timeMode: "clock", clock })).toBeNull();
    }
    expect(sanitizeTimelineDivider({ mode: "day", day: 1, timeMode: "clock", clock: "00:00" })).not.toBeNull();
  });

  it("rejects out-of-range or non-numeric day values", () => {
    for (const day of [0, -1, 1000, NaN, "abc"]) {
      expect(sanitizeTimelineDivider(ok({ day: day as never }))).toBeNull();
    }
  });

  it("rejects malformed dates", () => {
    for (const date of ["2026-7-25", "2026-13-01", "not-a-date", ""]) {
      expect(sanitizeTimelineDivider({ mode: "date", date, timeMode: "segment", segment: "night" })).toBeNull();
    }
  });

  it("rejects non-objects outright", () => {
    for (const junk of [null, undefined, "pwned", 42, [], true]) {
      expect(sanitizeTimelineDivider(junk)).toBeNull();
    }
  });
});

describe("parseTimelinePayload", () => {
  it("returns null for junk rather than handing back a non-object", () => {
    expect(parseTimelinePayload('{"timelineDivider":"pwned"}')).toBeNull();
    expect(parseTimelinePayload('{"timelineDivider":[1,2]}')).toBeNull();
    expect(parseTimelinePayload("not json")).toBeNull();
    expect(parseTimelinePayload(null)).toBeNull();
  });

  it("round-trips what buildTimelinePayload wrote", () => {
    const data: TimelineDividerData = { mode: "day", day: 3, timeMode: "clock", clock: "21:00" };
    expect(parseTimelinePayload(buildTimelinePayload(data))).toEqual(data);
  });
});
