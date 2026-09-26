import { describe, it, expect, vi, beforeEach } from "vitest";

// The inventory write actions return `{ success, error }` with a localized
// error instead of throwing (Next.js redacts thrown messages in production).

const tryRoomAccess = vi.fn();
vi.mock("@/lib/auth/room-access", () => ({
  tryRoomAccess: (...a: unknown[]) => tryRoomAccess(...a),
  checkRoomAccess: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: "2", name: "Ann" } }) }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("@/lib/messaging/router", () => ({ dispatchMessage: vi.fn(() => Promise.resolve()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const shareItemCore = vi.fn();
vi.mock("@/lib/room/inventory-share", () => ({ shareItemCore: (...a: unknown[]) => shareItemCore(...a) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "set", "values", "returning"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
const insert = vi.fn(() => chain(() => []));
const del = vi.fn(() => chain(() => []));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    insert: () => insert(),
    update: () => chain(() => []),
    delete: () => del(),
  },
}));

import {
  createInventoryItemAction, updateInventoryItemAction, distributeItemAction,
  shareItemAction, deleteInventoryItemAction, markInventoryViewedAction,
} from "../inventory";

const NO_ACCESS = { success: false, error: "roomActions.errorNoAccess" };
const item = { type: "clue" as const, title: "Key", content: {} };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  tryRoomAccess.mockResolvedValue({ userId: 1, isHost: true, isAdmin: false });
});

describe("createInventoryItemAction", () => {
  it("rejects a non-host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await createInventoryItemAction(5, item)).toEqual(NO_ACCESS);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates the item", async () => {
    expect(await createInventoryItemAction(5, item)).toEqual({ success: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("item lookups", () => {
  it("updateInventoryItemAction reports an item from another room", async () => {
    selectQueue = [[{ id: 3, roomId: 9 }]];
    expect(await updateInventoryItemAction(5, 3, item))
      .toEqual({ success: false, error: "inventoryActions.errorItemNotFound" });
  });

  it("deleteInventoryItemAction reports a missing item", async () => {
    selectQueue = [[]];
    expect(await deleteInventoryItemAction(5, 3))
      .toEqual({ success: false, error: "inventoryActions.errorItemNotFound" });
    expect(del).not.toHaveBeenCalled();
  });

  it("deleteInventoryItemAction deletes an item of this room", async () => {
    selectQueue = [[{ id: 3, roomId: 5 }]];
    expect(await deleteInventoryItemAction(5, 3)).toEqual({ success: true });
    expect(del).toHaveBeenCalledTimes(1);
  });
});

describe("distributeItemAction", () => {
  it("rejects a non-host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await distributeItemAction(5, 3, 2)).toEqual(NO_ACCESS);
  });

  it("reports a recipient outside the room", async () => {
    selectQueue = [[{ id: 3, roomId: 5, title: "Key", type: "clue" }], []];
    expect(await distributeItemAction(5, 3, 7))
      .toEqual({ success: false, error: "inventoryActions.errorRecipientNotMember" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("succeeds without writing when the recipient already holds it", async () => {
    selectQueue = [[{ id: 3, roomId: 5, title: "Key", type: "clue" }], [{ id: 1 }], [{ toUserId: 7 }]];
    expect(await distributeItemAction(5, 3, 7)).toEqual({ success: true });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("shareItemAction", () => {
  it("rejects a caller without write access", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await shareItemAction(5, 3, 7)).toEqual(NO_ACCESS);
    expect(shareItemCore).not.toHaveBeenCalled();
  });

  it("returns the core's already-localized error as-is", async () => {
    shareItemCore.mockResolvedValue({ success: false, code: "ALREADY_OWNED", error: "已拥有" });
    expect(await shareItemAction(5, 3, 7)).toEqual({ success: false, error: "已拥有" });
  });

  it("localizes the core's English errors by code", async () => {
    shareItemCore.mockResolvedValue({ success: false, code: "NOT_OWNED", error: "You don't have this item in this room" });
    expect(await shareItemAction(5, 3, 7)).toEqual({ success: false, error: "inventoryActions.errorNotOwned" });
  });

  it("succeeds when the core does", async () => {
    shareItemCore.mockResolvedValue({ success: true, itemTitle: "Key", recipientName: "Bo" });
    expect(await shareItemAction(5, 3, 7)).toEqual({ success: true });
  });
});

describe("markInventoryViewedAction", () => {
  it("rejects a non-member", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await markInventoryViewedAction(5)).toEqual(NO_ACCESS);
  });
});
