import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSelect } = vi.hoisted(() => {
  return {
    mockSelect: vi.fn(),
  };
});

vi.mock("../../db", () => {
  return {
    db: {
      select: mockSelect,
    },
  };
});

vi.mock("../../db/schema", () => {
  return {
    dailyStats: {
      date: "date",
      visitCount: "visit_count",
      peakOnline: "peak_online",
      updatedAt: "updated_at",
    },
  };
});

vi.mock("drizzle-orm", () => {
  return {
    asc: vi.fn(),
    sql: vi.fn(),
  };
});

import { getLiveOnlineCount, getHistoricalStats } from "../stats";

describe("Traffic and Online Statistics Helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSelect.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return correct live online count based on unique active connections", () => {
    globalThis.__userConnections = new Map([
      [101, new Set([{ controller: {} as ReadableStreamDefaultController, cleanup: () => {} }])],
      [102, new Set([{ controller: {} as ReadableStreamDefaultController, cleanup: () => {} }, { controller: {} as ReadableStreamDefaultController, cleanup: () => {} }])],
      [103, new Set([])], // empty connections set
    ]);

    const count = getLiveOnlineCount();
    expect(count).toBe(2); // Only users 101 and 102 have active connections
  });

  it("should return 0 when global user connections is not defined", () => {
    globalThis.__userConnections = undefined;
    const count = getLiveOnlineCount();
    expect(count).toBe(0);
  });

  it("should aggregate stats correctly for 'day' range", async () => {
    // stats.ts buckets days by UTC date; pin the clock so the fixture
    // matches deterministically regardless of run date and timezone.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    const todayStr = "2026-03-15";
    const yesterdayStr = "2026-03-14";

    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue([
          { date: todayStr, visitCount: 50, peakOnline: 10 },
          { date: yesterdayStr, visitCount: 80, peakOnline: 15 },
        ]),
      })),
    });

    const stats = await getHistoricalStats("day");
    
    expect(stats.length).toBe(15);
    
    // Today
    const todayEntry = stats[14];
    expect(todayEntry.visitCount).toBe(50);
    expect(todayEntry.peakOnline).toBe(10);

    // Yesterday
    const yesterdayEntry = stats[13];
    expect(yesterdayEntry.visitCount).toBe(80);
    expect(yesterdayEntry.peakOnline).toBe(15);

    // Non-recorded days default to 0
    expect(stats[0].visitCount).toBe(0);
    expect(stats[0].peakOnline).toBe(0);
  });
});
