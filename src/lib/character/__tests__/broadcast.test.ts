import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let memberRows: Array<{ characterData: string | null }> = [];

vi.mock("@/db/schema", () => ({
  roomMembers: { characterData: "characterData", roomId: "m.roomId", userId: "m.userId" },
  rooms: { ruleTemplate: "ruleTemplate", id: "r.id" },
  roomSkills: { skillName: "skillName", roomId: "s.roomId", userId: "s.userId" },
}));
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema");
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === schema.roomMembers) {
            return { for: (mode: string) => { calls.push(`lock member for ${mode}`); return memberRows; } };
          }
          if (table === schema.rooms) { calls.push("read room"); return [{ ruleTemplate: "coc7th" }]; }
          calls.push("read skills");
          return [{ skillName: "信用评级" }];
        },
      }),
    }),
  };
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => {
        calls.push("begin");
        const r = await fn(tx);
        calls.push("commit");
        return r;
      },
    },
  };
});
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn(() => calls.push("emit")) }));

import { broadcastCharacterUpdate, characterUpdatePayload, writeOrigin } from "../broadcast";
import { broadcastToRoom } from "@/lib/server/events";
import { emptySheet } from "../sheet-v2";

beforeEach(() => {
  calls.length = 0;
  memberRows = [];
  vi.mocked(broadcastToRoom).mockClear();
});

describe("characterUpdatePayload", () => {
  it("carries the vital, the completion against the room rule and the writing tab", () => {
    const sheet = { ...emptySheet("coc7th"), attributes: { str: 60 }, resources: { hp: { current: 4 } } };
    expect(characterUpdatePayload(3, sheet, ["信用评级"], "coc7th", "tab-1")).toEqual({
      type: "character_updated",
      userId: 3,
      vital: { key: "hp", labelKey: "hp", current: 4, max: 10, style: "bar" },
      completion: {
        requiredTotal: 10, requiredSet: 2,
        missing: ["dex", "con", "int", "pow", "edu", "siz", "app", "luck"].map((key) => ({ kind: "attribute", key })),
      },
      origin: "tab-1",
    });
  });

  it("counts a missing sheet as nothing set", () => {
    expect(characterUpdatePayload(3, null, [], "dnd5e", null))
      .toMatchObject({ vital: null, completion: { requiredTotal: 7, requiredSet: 0 }, origin: null });
  });
});

describe("broadcastCharacterUpdate", () => {
  it("reads the member's row under its lock and emits before releasing it", async () => {
    const sheet = { ...emptySheet("coc7th"), attributes: { str: 60 }, resources: { hp: { current: 4 } } };
    memberRows = [{ characterData: JSON.stringify(sheet) }];
    await broadcastCharacterUpdate(5, 3, { by: 1, tab: "tab-1" });
    expect(calls).toEqual(["begin", "lock member for update", "read room", "read skills", "emit", "commit"]);
    expect(broadcastToRoom).toHaveBeenCalledWith(5, characterUpdatePayload(3, sheet, ["信用评级"], "coc7th", "1:tab-1"));
  });

  it("still broadcasts for a member without a row, as nothing set", async () => {
    await broadcastCharacterUpdate(5, 3);
    expect(broadcastToRoom).toHaveBeenCalledWith(5, expect.objectContaining({ vital: null, origin: null }));
  });

  it("sends no origin for a tab id that isn't one, or without a caller", async () => {
    await broadcastCharacterUpdate(5, 3, { by: 1, tab: "x".repeat(65) });
    await broadcastCharacterUpdate(5, 3, { tab: "tab-1" });
    expect(vi.mocked(broadcastToRoom).mock.calls.map(([, p]) => (p as { origin: unknown }).origin)).toEqual([null, null]);
  });
});

describe("writeOrigin", () => {
  it("binds a valid tab id to the caller", () => {
    expect(writeOrigin(7, "mfz3k2-4hq9x0a1bc")).toBe("7:mfz3k2-4hq9x0a1bc");
  });

  it("rejects an untrusted tab id that isn't one, or a missing caller", () => {
    for (const v of [undefined, null, "", 3, "a b", "<script>", "1:tab", "x".repeat(65), {}]) expect(writeOrigin(7, v)).toBeNull();
    expect(writeOrigin(null, "tab-1")).toBeNull();
    expect(writeOrigin(undefined, "tab-1")).toBeNull();
    expect(writeOrigin(1.5, "tab-1")).toBeNull();
  });
});
