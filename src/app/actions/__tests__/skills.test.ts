import { describe, it, expect, vi, beforeEach } from "vitest";

let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));
vi.mock("@/lib/character/broadcast", () => ({ broadcastCharacterUpdate: vi.fn() }));
vi.mock("@/lib/commands/engine", () => ({ syncCharacterSanity: vi.fn() }));
const resolveSheetWriter = vi.fn();
vi.mock("@/lib/auth/sheet-access", () => ({ resolveSheetWriter: (...a: unknown[]) => resolveSheetWriter(...a) }));

const inserted: unknown[] = [];
const deleted = vi.fn();
vi.mock("@/db", () => ({
  sqlNow: () => "now",
  db: {
    insert: () => ({ values: (v: unknown) => { inserted.push(v); return { onConflictDoUpdate: () => Promise.resolve() }; } }),
    delete: () => ({ where: (w: unknown) => { deleted(w); return Promise.resolve(); } }),
  },
}));

import { upsertSkillAction, deleteSkillAction } from "../skills";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  session = { user: { id: "1", role: "player" } };
  resolveSheetWriter.mockResolvedValue({ ok: true, callerId: 1, room: {} });
});

describe("upsertSkillAction", () => {
  it("lets the host write another member's skill and broadcasts for that member", async () => {
    expect(await upsertSkillAction(5, " 侦查 ", 60, 3, "tab-1")).toEqual({ success: true });
    expect(resolveSheetWriter).toHaveBeenCalledWith(5, 3);
    expect(inserted[0]).toMatchObject({ roomId: 5, userId: 3, skillName: "侦查", skillValue: 60 });
    expect(broadcastCharacterUpdate).toHaveBeenCalledWith(5, 3, { by: 1, tab: "tab-1" });
  });

  it("defaults to the caller's own card", async () => {
    await upsertSkillAction(5, "聆听", 40);
    expect(resolveSheetWriter).toHaveBeenCalledWith(5, 1);
  });

  it("passes the writer's refusal through without writing", async () => {
    resolveSheetWriter.mockResolvedValue({ ok: false, key: "errorUnauthorizedResource" });
    expect(await upsertSkillAction(5, "侦查", 60, 3))
      .toEqual({ success: false, error: "character.errorUnauthorizedResource" });
    expect(inserted).toHaveLength(0);
  });

  it("rejects a blank name or an out-of-range value", async () => {
    expect((await upsertSkillAction(5, "  ", 60)).success).toBe(false);
    expect((await upsertSkillAction(5, "侦查", 1000)).success).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("reports a signed-out caller", async () => {
    session = null;
    expect(await upsertSkillAction(5, "侦查", 60)).toEqual({ success: false, error: "character.errorNotAuthenticated" });
  });
});

describe("deleteSkillAction", () => {
  it("deletes on the target's card when allowed", async () => {
    expect(await deleteSkillAction(5, 9, 3, "tab-1")).toEqual({ success: true });
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(broadcastCharacterUpdate).toHaveBeenCalledWith(5, 3, { by: 1, tab: "tab-1" });
  });

  it("does nothing when refused", async () => {
    resolveSheetWriter.mockResolvedValue({ ok: false, key: "errorRoomFrozen" });
    expect(await deleteSkillAction(5, 9)).toEqual({ success: false, error: "character.errorRoomFrozen" });
    expect(deleted).not.toHaveBeenCalled();
  });
});
