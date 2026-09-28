import { describe, it, expect, vi, beforeEach } from "vitest";

// The character-sheet write actions return `{ success, error }` with a
// localized error instead of throwing (Next.js redacts thrown messages in
// production). Membership keeps its three reasons: signed out / not a member /
// frozen.

let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("@/lib/character/broadcast", () => ({ broadcastCharacterUpdate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "set", "innerJoin", "for"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
/** The last `characterData` written by `db.update(...).set(...)`. */
let written: Record<string, unknown> | null = null;
const update = vi.fn(() => {
  const c = chain(() => []);
  c.set = (v: { characterData?: string }) => { if (v.characterData) written = JSON.parse(v.characterData); return c; };
  return c;
});
vi.mock("@/db", () => {
  const db = {
    select: () => chain(() => selectQueue.shift() ?? []),
    update: () => update(),
    // Sheet writes run in `updateSheetRow`'s transaction; the mock runs it inline.
    transaction: (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db };
});

import {
  ensureCharacterSheetAction, rebuildCharacterForRoomRuleAction, editCharacterAction, getCharacterDataAction,
} from "../character";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";

/** Rows for checkMembership: the member row, then the room row. */
const member = (room: { frozen: boolean; hostId: number } = { frozen: false, hostId: 1 }) =>
  [[{ id: 7 }], [room]];

/** Rows for resolveSheetWriter: the room, then the caller/target member rows. */
const writer = (
  room: { hostId: number; frozen: boolean; ruleTemplate?: string } | null,
  members: { userId: number }[],
) => [room ? [{ ruleTemplate: "basic", ...room }] : [], members];

/** The row `updateSheetRow` locks and reads before a write. */
const locked = (characterData: string | null = null) => [[{ id: 99, characterData }]];

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  written = null;
  session = { user: { id: "2", role: "player" } };
});

describe("ensureCharacterSheetAction", () => {
  it("stays silent for a signed-out caller or a non-member", async () => {
    session = null;
    expect(await ensureCharacterSheetAction(5)).toEqual({ status: "ok" });
    session = { user: { id: "2", role: "player" } };
    selectQueue = [[]];
    expect(await ensureCharacterSheetAction(5)).toEqual({ status: "ok" });
  });

  it("stores an empty v2 sheet for a member without one", async () => {
    selectQueue = [[{ characterData: null }], [{ id: 5, hostId: 1, frozen: false, ruleTemplate: "coc7th" }], ...locked()];
    const res = await ensureCharacterSheetAction(5);
    expect(res).toMatchObject({ status: "initialized", data: { schemaVersion: 2, ruleTemplate: "coc7th" } });
    expect(written).toEqual({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: {}, resources: {}, rev: 1 });
  });

  it("reports a sheet built for another rule without writing", async () => {
    const sheet = { schemaVersion: 2, ruleTemplate: "dnd5e", attributes: {}, resources: {} };
    selectQueue = [[{ characterData: JSON.stringify(sheet) }], [{ id: 5, hostId: 1, frozen: false, ruleTemplate: "coc7th" }]];
    expect(await ensureCharacterSheetAction(5)).toEqual({ status: "mismatch", sheetRule: "dnd5e", roomRule: "coc7th" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("rebuildCharacterForRoomRuleAction", () => {
  it("rejects a non-member", async () => {
    selectQueue = writer({ hostId: 1, frozen: false }, []);
    expect(await rebuildCharacterForRoomRuleAction(5, 2)).toEqual({ success: false, error: "character.errorNotMember" });
  });

  it("reports a frozen room to a player", async () => {
    selectQueue = writer({ hostId: 1, frozen: true }, [{ userId: 2 }]);
    expect(await rebuildCharacterForRoomRuleAction(5, 2)).toEqual({ success: false, error: "character.errorRoomFrozen" });
  });

  it("refuses another player's sheet", async () => {
    selectQueue = writer({ hostId: 1, frozen: false }, [{ userId: 2 }, { userId: 3 }]);
    expect(await rebuildCharacterForRoomRuleAction(5, 3)).toEqual({ success: false, error: "character.errorUnauthorizedResource" });
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps the profile and starts the new rule's fields empty", async () => {
    const legacy = JSON.stringify({ ruleTemplate: "coc7th", bio: "old", cocAttributes: { str: 70 } });
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "dnd5e" }, [{ userId: 2 }]), ...locked(legacy)];
    const res = await rebuildCharacterForRoomRuleAction(5, 2);
    expect(res).toMatchObject({ success: true, data: { ruleTemplate: "dnd5e", bio: "old", attributes: {} } });
    expect(broadcastCharacterUpdate).toHaveBeenCalledWith(5, 2, expect.objectContaining({ by: 2 }));
  });

  it("lets the host rebuild a bot's sheet", async () => {
    session = { user: { id: "1", role: "player" } };
    const coc = JSON.stringify({ schemaVersion: 2, ruleTemplate: "coc7th", name: "Bot", attributes: { str: 60 }, resources: {} });
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "dnd5e" }, [{ userId: 1 }, { userId: 3 }]), ...locked(coc)];
    const res = await rebuildCharacterForRoomRuleAction(5, 3);
    expect(res).toMatchObject({ success: true, data: { ruleTemplate: "dnd5e", name: "Bot", attributes: {} } });
    expect(written).toMatchObject({ ruleTemplate: "dnd5e", name: "Bot" });
    expect(broadcastCharacterUpdate).toHaveBeenCalledWith(5, 3, expect.objectContaining({ by: 1 }));
  });

  it("leaves a sheet already on the room's rule untouched", async () => {
    const current = JSON.stringify({ schemaVersion: 2, ruleTemplate: "dnd5e", attributes: { str: 14 }, resources: {} });
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "dnd5e" }, [{ userId: 2 }]), ...locked(current)];
    const res = await rebuildCharacterForRoomRuleAction(5, 2);
    expect(res).toMatchObject({ success: true, data: { attributes: { str: 14 } } });
    expect(update).not.toHaveBeenCalled();
    expect(broadcastCharacterUpdate).not.toHaveBeenCalled();
  });
});

describe("getCharacterDataAction", () => {
  it("upgrades a legacy row on read", async () => {
    const legacy = {
      ruleTemplate: "coc7th",
      cocAttributes: { str: 70, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 },
    };
    selectQueue = [...member(), [{ characterData: JSON.stringify(legacy), ruleTemplate: "coc7th" }]];
    const data = await getCharacterDataAction(5, 3);
    expect(data).toMatchObject({ schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 70 } });
  });
});

describe("editCharacterAction", () => {
  it("reports a signed-out caller", async () => {
    session = null;
    expect(await editCharacterAction(5, 2, {})).toEqual({ success: false, error: "character.errorNotAuthenticated" });
  });

  it("rejects a malformed edit before touching the database", async () => {
    expect(await editCharacterAction(5, 2, { attributes: [1] } as never))
      .toEqual({ success: false, error: "character.errorInvalidEdit" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses another player's sheet", async () => {
    selectQueue = writer({ hostId: 1, frozen: false }, [{ userId: 2 }, { userId: 3 }]);
    expect(await editCharacterAction(5, 3, { attributes: { str: 1 } }))
      .toEqual({ success: false, error: "character.errorUnauthorizedResource" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a frozen room to a player", async () => {
    selectQueue = writer({ hostId: 1, frozen: true }, [{ userId: 2 }]);
    expect(await editCharacterAction(5, 2, {})).toEqual({ success: false, error: "character.errorRoomFrozen" });
  });

  it("reports a target who is not a member", async () => {
    session = { user: { id: "1", role: "player" } };
    selectQueue = writer({ hostId: 1, frozen: false }, [{ userId: 1 }]);
    expect(await editCharacterAction(5, 9, {})).toEqual({ success: false, error: "character.errorTargetNotMember" });
    expect(update).not.toHaveBeenCalled();
  });

  it("lets the host edit another member's attributes and counters, and broadcasts", async () => {
    session = { user: { id: "1", role: "player" } };
    const sheet = { schemaVersion: 2, ruleTemplate: "triangle", attributes: {}, resources: {} };
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "triangle" }, [{ userId: 1 }, { userId: 3 }]),
      ...locked(JSON.stringify(sheet))];
    const res = await editCharacterAction(5, 3, {
      attributes: { empathy: 4, bogus: 9 },
      resources: { commendations: { current: 4 }, reprimands: { current: -1 } },
    });
    expect(res.success).toBe(true);
    expect(written).toEqual({
      schemaVersion: 2, ruleTemplate: "triangle",
      attributes: { empathy: 4 },
      resources: { commendations: { current: 4 }, reprimands: { current: 0 } },
      rev: 1,
    });
    // The reply is the stored copy, write counter included.
    expect(res.success && res.data).toEqual(written);
    expect(broadcastCharacterUpdate).toHaveBeenCalledWith(5, 3, { by: 1 });
  });

  it("steps a resource from the locked row's value by a delta", async () => {
    session = { user: { id: "1", role: "player" } };
    // The client last saw 4; another writer stored 2 meanwhile.
    const sheet = { schemaVersion: 2, ruleTemplate: "triangle", attributes: {}, resources: { commendations: { current: 2 } } };
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "triangle" }, [{ userId: 1 }, { userId: 3 }]),
      ...locked(JSON.stringify(sheet))];
    const res = await editCharacterAction(5, 3, { resources: { commendations: { delta: 1 } } });
    expect(res.success).toBe(true);
    expect(written).toMatchObject({ resources: { commendations: { current: 3 } } });
  });

  it("lets the host write in a frozen room", async () => {
    session = { user: { id: "1", role: "player" } };
    selectQueue = [...writer({ hostId: 1, frozen: true }, [{ userId: 1 }, { userId: 3 }]), ...locked()];
    expect((await editCharacterAction(5, 3, { profile: { bio: "x" } })).success).toBe(true);
  });

  it("upgrades a legacy sheet before editing it", async () => {
    const legacy = { ruleTemplate: "coc7th", cocDerived: { hp_current: 3 } };
    selectQueue = [...writer({ hostId: 1, frozen: false, ruleTemplate: "coc7th" }, [{ userId: 2 }]), ...locked(JSON.stringify(legacy))];
    expect((await editCharacterAction(5, 2, { profile: { bio: "x" } })).success).toBe(true);
    expect(written).toMatchObject({ schemaVersion: 2, bio: "x", resources: { hp: { current: 3 } } });
  });
});
