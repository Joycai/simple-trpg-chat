import { describe, it, expect } from "vitest";
import { dayPartFromDivider } from "@/lib/messaging/timeline-payload";
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
