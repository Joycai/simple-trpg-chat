import { describe, it, expect, vi, beforeEach } from "vitest";

// The character-sheet write actions return `{ success, error }` with a
// localized error instead of throwing (Next.js redacts thrown messages in
// production). Membership keeps its three reasons: signed out / not a member /
// frozen.

let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string) => `${ns}.${key}`),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "set"]) c[m] = () => c;
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
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    update: () => update(),
  },
}));

import {
  initCharacterAction, saveCharacterDataAction, addCustomAttributeAction,
  removeCustomAttributeAction, rebuildCharacterForRoomRuleAction, updateResourcesAction,
} from "../character";
import { CHARACTER_DATA_MAX_BYTES } from "@/lib/character/types";

/** Queue rows for checkMembership: the member row, then the room row. */
const member = (room: { frozen: boolean; hostId: number } = { frozen: false, hostId: 1 }) =>
  [[{ id: 7 }], [room]];

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  written = null;
  session = { user: { id: "2", role: "player" } };
});

describe("membership", () => {
  it("reports a signed-out caller", async () => {
    session = null;
    expect(await initCharacterAction(5)).toEqual({ success: false, error: "character.errorNotAuthenticated" });
  });

  it("reports a non-member", async () => {
    selectQueue = [[]];
    expect(await saveCharacterDataAction(5, {})).toEqual({ success: false, error: "character.errorNotMember" });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a frozen room to a player", async () => {
    selectQueue = member({ frozen: true, hostId: 1 });
    expect(await addCustomAttributeAction(5, { name: "a", value: 1 }))
      .toEqual({ success: false, error: "character.errorRoomFrozen" });
  });

  it("lets the host write in a frozen room", async () => {
    selectQueue = [...member({ frozen: true, hostId: 2 }), [{ characterData: null }]];
    expect(await removeCustomAttributeAction(5, "a")).toEqual({ success: true });
  });
});

describe("initCharacterAction / rebuildCharacterForRoomRuleAction", () => {
  it("returns the seeded sheet", async () => {
    selectQueue = [...member(), [{ ruleTemplate: "basic" }]];
    const res = await initCharacterAction(5);
    expect(res.success).toBe(true);
    expect(res.success && res.data.ruleTemplate).toBe("basic");
  });

  it("rebuild rejects a non-member", async () => {
    selectQueue = [[]];
    expect(await rebuildCharacterForRoomRuleAction(5)).toEqual({ success: false, error: "character.errorNotMember" });
  });
});

describe("saveCharacterDataAction", () => {
  it("rejects an oversized sheet without writing", async () => {
    selectQueue = [...member(), [{ characterData: null }]];
    const res = await saveCharacterDataAction(5, { bio: "x".repeat(CHARACTER_DATA_MAX_BYTES) });
    expect(res).toEqual({ success: false, error: "character.errorDataTooLarge" });
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a normal sheet", async () => {
    selectQueue = [...member(), [{ characterData: null }]];
    const res = await saveCharacterDataAction(5, { bio: "hi" });
    expect(res.success).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("updateResourcesAction", () => {
  it("refuses another player's sheet", async () => {
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: false }]];
    expect(await updateResourcesAction(5, 3, { hp_current: 1 }))
      .toEqual({ success: false, error: "character.errorUnauthorizedResource" });
  });

  it("reports a frozen room to a player", async () => {
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: true }]];
    expect(await updateResourcesAction(5, 2, { hp_current: 1 }))
      .toEqual({ success: false, error: "character.errorRoomFrozen" });
  });

  it("reports a target who is not a member", async () => {
    session = { user: { id: "1", role: "host" } };
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: false }], []];
    expect(await updateResourcesAction(5, 9, { hp_current: 1 }))
      .toEqual({ success: false, error: "character.errorTargetNotMember" });
    expect(update).not.toHaveBeenCalled();
  });

  it("lets the host set another member's counter resources (triangle)", async () => {
    session = { user: { id: "1", role: "host" } };
    const sheet = { ruleTemplate: "triangle", taSheet: { commendations: 0, reprimands: 0 } };
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: false }], [{ characterData: JSON.stringify(sheet) }]];
    expect(await updateResourcesAction(5, 3, { counters: { commendations: 4, reprimands: 1 } })).toEqual({ success: true });
    expect(written).toMatchObject({ taSheet: { commendations: 4, reprimands: 1 } });
  });

  it("ignores counters the rule doesn't declare", async () => {
    session = { user: { id: "1", role: "host" } };
    const sheet = { ruleTemplate: "basic" };
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: false }], [{ characterData: JSON.stringify(sheet) }]];
    expect(await updateResourcesAction(5, 3, { counters: { commendations: 4 } })).toEqual({ success: true });
    expect(written).toEqual({ ruleTemplate: "basic" });
  });

  it("updates the caller's own resources", async () => {
    selectQueue = [[{ id: 7 }], [{ hostId: 1, frozen: false }], [{ characterData: null }]];
    expect(await updateResourcesAction(5, 2, { hp_current: 1 })).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
