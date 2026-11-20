import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn(() => Promise.resolve());
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/room-access", () => ({
  checkRoomAccess: vi.fn(async () => ({ userId: 1, isHost: true, isAdmin: false })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));
vi.mock("@/lib/server/events", () => ({ emitToUser: vi.fn() }));

let selectQueue: unknown[][] = [];
const insert = vi.fn();
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "orderBy", "limit", "values", "onConflictDoUpdate"]) {
    c[m] = () => c;
  }
  c.then = (resolve: (r: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
  return c;
}
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    insert: () => { insert(); return chain(() => []); },
  },
  sqlNow: () => "NOW()",
}));

import { updateSystemConfig, updateSystemConfigBatch } from "../ai";
import { startTextImportAnalysisAction } from "../ai-import";
import { imageJobAllowed } from "@/lib/ai/image/job-access";

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  requireAdmin.mockImplementation(() => Promise.resolve());
});

describe("updateSystemConfig validation", () => {
  it("rejects unknown system config keys", async () => {
    await expect(updateSystemConfig("arbitrary_key", "1")).rejects.toThrow("Invalid system config key");
    await expect(updateSystemConfigBatch({ arbitrary_key: "1" })).rejects.toThrow("Invalid system config key");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects non-boolean strings for ai_enabled", async () => {
    await expect(updateSystemConfig("ai_enabled", "yes")).rejects.toThrow("Invalid ai_enabled value");
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts valid ai_enabled values", async () => {
    await updateSystemConfig("ai_enabled", "true");
    await updateSystemConfig("ai_enabled", "false");
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

describe("global ai_enabled enforcement", () => {
  it("blocks AI import when ai_enabled is missing or false", async () => {
    selectQueue = [[]];
    expect(await startTextImportAnalysisAction(1, "text")).toEqual({
      success: false,
      error: "aiImport.errAiDisabled",
    });

    selectQueue = [[{ value: "false" }]];
    expect(await startTextImportAnalysisAction(1, "text")).toEqual({
      success: false,
      error: "aiImport.errAiDisabled",
    });
  });

  it("blocks queued bot image jobs when ai_enabled is missing or false", async () => {
    selectQueue = [[]];
    expect(await imageJobAllowed({ roomId: 1, botUserId: 2, hostId: 3, replyIsPrivate: false, targetUserId: null })).toBe(false);

    selectQueue = [[{ value: "false" }]];
    expect(await imageJobAllowed({ roomId: 1, botUserId: 2, hostId: 3, replyIsPrivate: false, targetUserId: null })).toBe(false);

    selectQueue = [[{ value: "true" }], [{ id: 2 }]];
    expect(await imageJobAllowed({ roomId: 1, botUserId: 2, hostId: 3, replyIsPrivate: false, targetUserId: null })).toBe(true);
  });
});
