import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanupImageCacheAction } from "../image-cache";

vi.mock("@/app/admin/actions", () => ({
  requireAdmin: vi.fn(() => Promise.resolve()),
}));

const broadcastToRoomMock = vi.fn();
vi.mock("@/lib/events", () => ({
  broadcastToRoom: (...args: unknown[]) => broadcastToRoomMock(...args),
}));

const cleanupImageCacheMock = vi.fn(() => Promise.resolve({ freedBytes: 100, deletedCount: 2 }));
const cleanupRoomBackgroundsMock = vi.fn(() =>
  Promise.resolve({ freedBytes: 50, deletedCount: 1, affectedActiveRoomIds: [7] })
);
vi.mock("@/lib/image-cache", () => ({
  getImageCacheStats: vi.fn(() =>
    Promise.resolve({
      totalBytes: 0, totalCount: 0, roomCount: 0, quotaBytes: 1,
      bytesToday: 0, bytes7d: 0, bytes30d: 0, rooms: [],
    })
  ),
  getRoomBackgroundStats: vi.fn(() =>
    Promise.resolve({ totalBytes: 0, totalCount: 0, roomCount: 0, rooms: [] })
  ),
  cleanupImageCache: (...args: unknown[]) => cleanupImageCacheMock(...args as []),
  cleanupRoomBackgrounds: (...args: unknown[]) => cleanupRoomBackgroundsMock(...args as []),
}));

// withRoomNames short-circuits on empty usage lists, so db is never queried here.
vi.mock("@/db", () => ({ db: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cleanupImageCacheAction — backgrounds are opt-in only", () => {
  it("default call never touches room backgrounds", async () => {
    const res = await cleanupImageCacheAction("all", "all");
    expect(cleanupImageCacheMock).toHaveBeenCalledWith("all", "all");
    expect(cleanupRoomBackgroundsMock).not.toHaveBeenCalled();
    expect(broadcastToRoomMock).not.toHaveBeenCalled();
    expect(res.deletedCount).toBe(2);
  });

  it("explicit false never touches room backgrounds", async () => {
    await cleanupImageCacheAction(3, "7d", false);
    expect(cleanupRoomBackgroundsMock).not.toHaveBeenCalled();
  });

  it("opt-in deletes the scope's backgrounds and notifies affected live rooms", async () => {
    const res = await cleanupImageCacheAction(3, "all", true);
    expect(cleanupRoomBackgroundsMock).toHaveBeenCalledWith(3);
    expect(broadcastToRoomMock).toHaveBeenCalledWith(7, { type: "room_settings_updated" });
    expect(res.freedBytes).toBe(150);
    expect(res.deletedCount).toBe(3);
  });

  it("a truthy-but-not-true flag does not count as opt-in (defensive against sloppy callers)", async () => {
    await cleanupImageCacheAction("all", "all", 1 as unknown as boolean);
    expect(cleanupRoomBackgroundsMock).not.toHaveBeenCalled();
  });
});
