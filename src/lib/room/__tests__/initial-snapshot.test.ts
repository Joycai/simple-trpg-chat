import { describe, it, expect, beforeEach, vi } from "vitest";

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
/** Rows for queries on a specific table, taken before the general queue. */
let byTable = new Map<unknown, unknown[][]>();
function chain() {
  let table: unknown;
  const c: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "innerJoin", "leftJoin", "groupBy"]) c[m] = () => c;
  c.from = (t: unknown) => { table = t; return c; };
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(byTable.get(table)?.shift() ?? selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}
vi.mock("@/db", () => ({
  db: { select: () => chain() },
}));

import {
  countUnreadDms, countUnreadEvents, countUnreadInventory, listVisibleEvents, loadCompletions, loadMemberSnapshot,
} from "../initial-snapshot";
import { rooms, roomMembers, roomSkills } from "@/db/schema";

const ev = (id: number, status: "unpublished" | "partial" | "full", updatedAt = `2026-01-0${id}`) => ({
  id, title: `e${id}`, description: "", timePayload: null, imagesJson: null, status, sortOrder: id, updatedAt,
});

beforeEach(() => {
  selectQueue = [];
  byTable = new Map();
});

describe("listVisibleEvents", () => {
  it("shows a player full events and only the partial ones granted to them", async () => {
    selectQueue = [
      [ev(1, "full"), ev(2, "partial"), ev(3, "partial"), ev(4, "unpublished")],
      [{ eventId: 3, viewed: false, updated: true, createdAt: "2026-02-01" }],
    ];
    const out = await listVisibleEvents(5, 2, false);
    expect(out.map((e) => e.id)).toEqual([3, 1]); // newest acquisition first
    expect(out[0]).toMatchObject({ updated: true, acquiredAt: "2026-02-01" });
    expect(out[1]).toMatchObject({ updated: false, acquiredAt: "2026-01-01" });
  });

  it("shows the host (or an observing admin) every event in authored order", async () => {
    selectQueue = [[ev(1, "full"), ev(2, "partial"), ev(4, "unpublished")], []];
    const out = await listVisibleEvents(5, 1, true);
    expect(out.map((e) => e.id)).toEqual([1, 2, 4]);
  });
});

describe("unread counts", () => {
  it("is always 0 events for the host, without querying", async () => {
    selectQueue = [[{ n: 9 }]];
    expect(await countUnreadEvents(5, 1, true)).toBe(0);
    expect(selectQueue).toHaveLength(1);
  });

  it("counts a player's unread events", async () => {
    selectQueue = [[{ n: "3" }]];
    expect(await countUnreadEvents(5, 2, false)).toBe(3);
  });

  it("keys unread DMs by sender", async () => {
    selectQueue = [[{ senderId: 3, count: 2 }, { senderId: 4, count: 1 }]];
    expect(await countUnreadDms(5, 2)).toEqual({ 3: 2, 4: 1 });
  });

  it("falls back to 0 unread items on an empty result", async () => {
    selectQueue = [[]];
    expect(await countUnreadInventory(5, 2)).toBe(0);
  });
});

describe("loadCompletions", () => {
  it("grades each member against the room rule, matching skill aliases", async () => {
    const coc = { schemaVersion: 2, ruleTemplate: "coc7th", attributes: { str: 60 }, resources: {} };
    byTable.set(rooms, [[{ ruleTemplate: "coc7th" }]]);
    byTable.set(roomMembers, [[
      { userId: 2, characterData: JSON.stringify(coc) },
      { userId: 3, characterData: null },
      { userId: 4, characterData: JSON.stringify({ ...coc, ruleTemplate: "dnd5e" }) },
    ]]);
    byTable.set(roomSkills, [[{ userId: 2, skillName: "信用" }]]);
    expect(await loadCompletions(5, 1, true)).toEqual({
      2: { requiredTotal: 10, requiredSet: 2 }, // str + 信用评级 (via 信用)
      3: { requiredTotal: 10, requiredSet: 0 },
      4: { requiredTotal: 10, requiredSet: 0 }, // built for another rule
    });
  });
});

describe("loadMemberSnapshot", () => {
  it("bundles the five reads", async () => {
    byTable.set(rooms, [[{ ruleTemplate: "basic" }]]);
    byTable.set(roomMembers, [[{ userId: 2, characterData: null }]]);
    byTable.set(roomSkills, [[]]);
    // The remaining queries take rows in the order they are awaited: the four
    // first queries in argument order, then the events' visibility lookup.
    selectQueue = [
      [{ senderId: 3, count: 1 }],
      [ev(1, "full")],
      [{ n: 2 }],
      [{ count: 4 }],
      [],
    ];
    const snap = await loadMemberSnapshot(5, 2, false);
    expect(snap).toMatchObject({
      unreadDms: { 3: 1 }, completions: { 2: { requiredTotal: 0, requiredSet: 0 } }, unreadEvents: 2, unreadItems: 4,
    });
    expect(snap.events.map((e) => e.id)).toEqual([1]);
  });
});
