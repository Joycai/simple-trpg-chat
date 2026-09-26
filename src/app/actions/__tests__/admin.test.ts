import { describe, it, expect, vi, beforeEach } from "vitest";

// The admin write actions return `{ success, error }` with a localized error
// instead of throwing (Next.js redacts thrown messages in production).

const requireAdmin = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/auth.config", () => ({ invalidateSessionCache: vi.fn() }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const cleanupRoomBackgrounds = vi.fn(() => Promise.resolve());
vi.mock("@/lib/media/image-cache", () => ({ cleanupRoomBackgrounds: () => cleanupRoomBackgrounds() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(() => Promise.resolve("hash")) } }));
// Echo the key so assertions name the message, not its wording.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "set", "values", "for", "returning"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
const update = vi.fn(() => chain(() => []));
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ select: () => chain(() => selectQueue.shift() ?? []), update, insert: () => chain(() => []) }));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    update: () => update(),
    delete: () => chain(() => []),
    transaction: (fn: (tx: unknown) => unknown) => transaction(fn),
  },
}));

import {
  toggleBanUser, createUser, updateUser, updateUserAiPoints, deleteUser,
  deleteRoom, adminSetRoomStatus,
} from "../admin";
import { USERNAME_MAX_LENGTH } from "@/lib/auth/user-limits";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  requireAdmin.mockImplementation(() => Promise.resolve());
});

describe("toggleBanUser", () => {
  it("rejects a non-admin caller", async () => {
    requireAdmin.mockImplementation(() => Promise.reject(new Error("Unauthorized")));
    expect(await toggleBanUser(2)).toEqual({ success: false, error: "admin.errorNotAdmin" });
  });

  it("reports a missing user", async () => {
    selectQueue = [[]];
    expect(await toggleBanUser(2)).toEqual({ success: false, error: "admin.errorUserNotFound" });
  });

  it("refuses to ban the default admin", async () => {
    selectQueue = [[{ id: 1, username: "admin", isBanned: false }]];
    expect(await toggleBanUser(1)).toEqual({ success: false, error: "admin.errorCannotBanDefaultAdmin" });
    expect(update).not.toHaveBeenCalled();
  });

  it("bans an ordinary user", async () => {
    selectQueue = [[{ id: 2, username: "bob", isBanned: false, sessionToken: "s" }]];
    expect(await toggleBanUser(2)).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("createUser", () => {
  it("rejects missing fields", async () => {
    expect(await createUser(form({ username: "bob", role: "player" })))
      .toEqual({ success: false, error: "admin.errorMissingFields" });
  });

  it("rejects an over-long username", async () => {
    const res = await createUser(form({ username: "a".repeat(USERNAME_MAX_LENGTH + 1), password: "pw", role: "player" }));
    expect(res).toEqual({ success: false, error: "admin.errorFieldTooLong" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an over-long display name", async () => {
    const res = await createUser(form({ username: "bob", displayName: "n".repeat(51), password: "pw", role: "player" }));
    expect(res).toEqual({ success: false, error: "admin.errorFieldTooLong" });
  });

  it("reports a taken username from the register namespace", async () => {
    selectQueue = [[{ id: 9 }]];
    expect(await createUser(form({ username: "bob", password: "pw", role: "player" })))
      .toEqual({ success: false, error: "register.errorUsernameTaken" });
  });
});

describe("updateUser", () => {
  it("rejects an over-long display name", async () => {
    expect(await updateUser(2, "n".repeat(51), "player")).toEqual({ success: false, error: "admin.errorFieldTooLong" });
  });

  it("refuses to demote the default admin", async () => {
    selectQueue = [[{ id: 1, username: "admin", role: "admin" }]];
    expect(await updateUser(1, "Admin", "player")).toEqual({ success: false, error: "admin.errorCannotDemoteDefaultAdmin" });
  });
});

describe("deleteUser", () => {
  it("refuses while the user still hosts rooms", async () => {
    selectQueue = [[{ id: 10 }, { id: 11 }]];
    expect(await deleteUser(3)).toEqual({ success: false, error: "admin.deleteUserHostsRooms" });
  });
});

describe("updateUserAiPoints", () => {
  it("refuses an admin target without opening a transaction", async () => {
    selectQueue = [[{ role: "admin" }]];
    expect(await updateUserAiPoints(1, 50)).toEqual({ success: false, error: "admin.errorCannotModifyAdminPoints" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reports a missing user without opening a transaction", async () => {
    selectQueue = [[]];
    expect(await updateUserAiPoints(99, 50)).toEqual({ success: false, error: "admin.errorUserNotFound" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("writes nothing if the row vanished before the lock", async () => {
    selectQueue = [[{ role: "player" }], []];
    expect(await updateUserAiPoints(2, 50)).toEqual({ success: false, error: "admin.errorUserNotFound" });
    expect(update).not.toHaveBeenCalled();
  });

  it("adjusts an ordinary user's points", async () => {
    selectQueue = [[{ role: "player" }], [{ id: 2, role: "player", aiPoints: 10 }]];
    expect(await updateUserAiPoints(2, 50)).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("room actions", () => {
  it("deleteRoom rejects a non-admin before touching background files", async () => {
    requireAdmin.mockImplementation(() => Promise.reject(new Error("Unauthorized")));
    expect(await deleteRoom(5)).toEqual({ success: false, error: "admin.errorNotAdmin" });
    expect(cleanupRoomBackgrounds).not.toHaveBeenCalled();
  });

  it("deleteRoom succeeds for an admin", async () => {
    expect(await deleteRoom(5)).toEqual({ success: true });
    expect(cleanupRoomBackgrounds).toHaveBeenCalledTimes(1);
  });

  it("adminSetRoomStatus rejects an unknown status", async () => {
    expect(await adminSetRoomStatus(5, "archived" as "closed")).toEqual({ success: false, error: "admin.errorInvalidStatus" });
    expect(update).not.toHaveBeenCalled();
  });
});
