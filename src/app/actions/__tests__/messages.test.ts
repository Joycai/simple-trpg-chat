import { describe, it, expect, vi, beforeEach } from "vitest";

// The message write actions return `{ success, error }` with a localized error
// instead of throwing (Next.js redacts thrown messages in production).

const tryRoomAccess = vi.fn();
const checkRoomAccess = vi.fn();
vi.mock("@/lib/auth/room-access", () => ({
  tryRoomAccess: (...a: unknown[]) => tryRoomAccess(...a),
  checkRoomAccess: (...a: unknown[]) => checkRoomAccess(...a),
}));
let session: { user: { id: string; role: string } } | null = null;
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(session) }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
const dispatchMessage = vi.fn(() => Promise.resolve({ id: 1 }));
vi.mock("@/lib/messaging/router", () => ({
  dispatchMessage: (...a: unknown[]) => dispatchMessage(...(a as [])),
  messageVisibilityWhere: vi.fn(),
}));
const executeCommand = vi.fn();
vi.mock("@/lib/commands/engine", () => ({ executeCommand: (...a: unknown[]) => executeCommand(...a) }));
vi.mock("@/lib/security/sensitive-words", () => ({ checkSensitiveWords: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/lib/media/stickers", () => ({ isValidStickerRef: () => false }));
const dispatchDiceRoll = vi.fn(() => Promise.resolve({ id: 2 }));
vi.mock("@/lib/messaging/dice-roll", () => ({ dispatchDiceRoll: () => dispatchDiceRoll() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => (key: string, params?: Record<string, unknown>) =>
    params ? `${ns}.${key}:${JSON.stringify(params)}` : `${ns}.${key}`),
  getLocale: vi.fn(async () => "zh"),
}));

/** Rows each successive `db.select()` resolves to, in call order. */
let selectQueue: unknown[][] = [];
function chain(rows: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "orderBy", "limit", "returning"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
const del = vi.fn(() => chain(() => []));
const insert = vi.fn(() => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    delete: () => del(),
    insert: () => insert(),
  },
  sqlNow: vi.fn(),
}));

import {
  sendMessageAction, rollDiceAction, insertTimelineDividerAction,
  withdrawTimelineDividerAction, executeCommandAction, markDMReadAction,
  loadMoreMessagesAction, catchUpMessagesAction,
} from "../messages";
import { MESSAGE_MAX_LENGTH, MAX_DICE_COUNT, MAX_DICE_FACES } from "@/lib/room/limits";

const NO_ACCESS = { success: false, error: "roomActions.errorNoAccess" };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  session = { user: { id: "2", role: "player" } };
  tryRoomAccess.mockResolvedValue({ userId: 2, isHost: false, isAdmin: false });
  checkRoomAccess.mockResolvedValue({ userId: 2, isHost: false, isAdmin: false });
});

describe("sendMessageAction", () => {
  it("rejects a caller without write access", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await sendMessageAction(5, "hi")).toEqual(NO_ACCESS);
    expect(dispatchMessage).not.toHaveBeenCalled();
  });

  it("rejects an over-long message", async () => {
    expect(await sendMessageAction(5, "x".repeat(MESSAGE_MAX_LENGTH + 1)))
      .toEqual({ success: false, error: `roomActions.errorMessageLength:{"max":${MESSAGE_MAX_LENGTH}}` });
    expect(dispatchMessage).not.toHaveBeenCalled();
  });

  it("rejects a forged message type", async () => {
    expect(await sendMessageAction(5, "x", "system" as "text"))
      .toEqual({ success: false, error: "roomActions.errorInvalidMessageType" });
  });

  it("rejects a remote image URL", async () => {
    expect(await sendMessageAction(5, "https://evil.example/x.png", "image"))
      .toEqual({ success: false, error: "roomActions.errorInvalidImageRef" });
  });

  it("rejects an unknown sticker", async () => {
    expect(await sendMessageAction(5, "/stickers/nope.png", "sticker"))
      .toEqual({ success: false, error: "roomActions.errorInvalidStickerRef" });
  });

  it("sends a text message", async () => {
    selectQueue = [[{ nickname: "Ann", isBot: false }]];
    expect(await sendMessageAction(5, "hello")).toEqual({ success: true });
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
  });

  it("rejects a sender whose membership row is gone", async () => {
    selectQueue = [[]];
    expect(await sendMessageAction(5, "hello")).toEqual(NO_ACCESS);
    expect(dispatchMessage).not.toHaveBeenCalled();
  });

  it("treats a failed command as handled (the error goes into the feed)", async () => {
    executeCommand.mockResolvedValue({ isCommand: true, success: false, error: "bad" });
    expect(await sendMessageAction(5, ".rc nope")).toEqual({ success: true });
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
  });
});

describe("rollDiceAction", () => {
  it("rejects a caller without write access", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await rollDiceAction(5, 6, 1)).toEqual(NO_ACCESS);
    expect(dispatchDiceRoll).not.toHaveBeenCalled();
  });

  it("rolls for a member", async () => {
    expect(await rollDiceAction(5, 6, 1)).toEqual({ success: true });
  });

  // Server Actions receive raw JSON, so these are real attack shapes, not
  // hypothetical ones. A hostile `faces` must be rejected BEFORE it reaches
  // rollDie (whose rejection loop would never terminate above 2^32).
  it.each([
    ["faces above 2^32", 2 ** 33, 1],
    ["faces Infinity", Number.POSITIVE_INFINITY, 1],
    ["faces NaN", Number.NaN, 1],
    ["fractional faces", 6.5, 1],
    ["zero faces", 0, 1],
    ["count Infinity", 6, Number.POSITIVE_INFINITY],
    ["fractional count", 6, 2.5],
    ["count zero", 6, 0],
    ["count above cap", 6, MAX_DICE_COUNT + 1],
  ] as const)("rejects %s", async (_label, faces, count) => {
    expect(await rollDiceAction(5, faces as number, count as number))
      .toEqual({ success: false, error: "roomActions.errorInvalidDice" });
    expect(dispatchDiceRoll).not.toHaveBeenCalled();
  });

  it("accepts the documented cap edge", async () => {
    expect(await rollDiceAction(5, MAX_DICE_FACES, MAX_DICE_COUNT)).toEqual({ success: true });
  });
});

describe("timeline dividers", () => {
  it("insert rejects a non-host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await insertTimelineDividerAction(5, {} as never)).toEqual(NO_ACCESS);
  });

  it("insert rejects an invalid payload", async () => {
    expect(await insertTimelineDividerAction(5, {} as never))
      .toEqual({ success: false, error: "timeline.errorInvalidPayload" });
  });

  it("insert posts a valid divider", async () => {
    tryRoomAccess.mockResolvedValue({ userId: 1, isHost: true, isAdmin: false });
    selectQueue = [[{ nickname: "KP" }]];
    const data = { mode: "day", day: 2, date: null, custom: null, timeMode: "segment", segment: "morning", clock: null };
    expect(await insertTimelineDividerAction(5, data as never)).toEqual({ success: true });
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
  });

  it("withdraw refuses a message that is not a divider", async () => {
    selectQueue = [[{ id: 9, roomId: 5, type: "text", systemKind: null }]];
    expect(await withdrawTimelineDividerAction(5, 9))
      .toEqual({ success: false, error: "timeline.errorNotDivider" });
    expect(del).not.toHaveBeenCalled();
  });

  it("withdraw deletes a divider", async () => {
    selectQueue = [[{ id: 9, roomId: 5, type: "system", systemKind: "timeline-divider" }]];
    expect(await withdrawTimelineDividerAction(5, 9)).toEqual({ success: true });
    expect(del).toHaveBeenCalledTimes(1);
  });
});

describe("executeCommandAction", () => {
  it("refuses to run a command as another user", async () => {
    expect(await executeCommandAction(5, 3, ".r d6"))
      .toEqual({ success: false, error: "roomActions.errorNoAccess", isCommand: true });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    session = null;
    expect(await executeCommandAction(5, 2, ".r d6"))
      .toEqual({ success: false, error: "roomActions.errorNoAccess", isCommand: true });
  });

  it("refuses the caller in a room they can't write to", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await executeCommandAction(5, 2, ".r d6"))
      .toEqual({ success: false, error: "roomActions.errorNoAccess", isCommand: true });
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("passes the engine's result through", async () => {
    executeCommand.mockResolvedValue({ isCommand: true, success: true });
    expect(await executeCommandAction(5, 2, ".r d6")).toEqual({ isCommand: true, success: true });
  });
});

describe("markDMReadAction", () => {
  it("rejects a non-member", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await markDMReadAction(5, 3)).toEqual(NO_ACCESS);
    expect(insert).not.toHaveBeenCalled();
  });

  it("records the read marker", async () => {
    expect(await markDMReadAction(5, 3)).toEqual({ success: true });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("bounded history paging", () => {
  // Client-supplied paging values are raw JSON: a huge or malformed `limit`
  // must never reach the query unbounded, and catch-up must report truncation
  // so the client can keep walking BACKWARDS instead of dropping a hole.
  const msg = (id: number) => ({
    id, roomId: 5, userId: 2, targetUserId: null, nickname: "Ann", content: `m${id}`,
    type: "text", systemKind: null, diceDetail: null, audience: "everyone",
    isPrivate: false, createdAt: "2026-11-09T00:00:00.000Z",
  });

  it("clamps an oversized page instead of forwarding it", async () => {
    // The query is `ORDER BY id DESC` + `.reverse()`, so the mock supplies DESC rows.
    selectQueue = [[msg(3), msg(2), msg(1)]];
    const rows = await loadMoreMessagesAction(5, 99, 10_000 as number);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("falls back to the default when the limit is not a positive integer", async () => {
    selectQueue = [[]];
    expect(await loadMoreMessagesAction(5, 99, Number.NaN)).toEqual([]);
    selectQueue = [[]];
    expect(await loadMoreMessagesAction(5, 99, -5)).toEqual([]);
  });

  it("reports a non-truncated catch-up when the page is partial", async () => {
    selectQueue = [[msg(20), msg(19)]];
    const res = await catchUpMessagesAction(5, 10);
    expect(res.messages.map((m) => m.id)).toEqual([19, 20]);
    expect(res.truncated).toBe(false);
    expect(res.gapBeforeMessageId).toBeNull();
  });

  it("reports truncation and the older-page cursor when rows remain in the gap", async () => {
    selectQueue = [
      [msg(20), msg(19), msg(18)],
      [{ id: 17 }], // the probe that proves an older visible row exists
    ];
    const res = await catchUpMessagesAction(5, 10, null, 3);
    expect(res.messages.map((m) => m.id)).toEqual([18, 19, 20]);
    expect(res.truncated).toBe(true);
    // The cursor is the OLDEST id of this page: the next call passes it as
    // `beforeMessageId` to fetch strictly older rows. Reusing it as `since`
    // would re-fetch this same page forever (the original bug).
    expect(res.gapBeforeMessageId).toBe(18);
  });

  it("accepts a beforeMessageId upper bound for the next (older) page", async () => {
    // Second page of the same gap: window (since=10, before=18).
    selectQueue = [[msg(17), msg(16)]];
    const res = await catchUpMessagesAction(5, 10, 18, 3);
    expect(res.messages.map((m) => m.id)).toEqual([16, 17]);
    expect(res.truncated).toBe(false);
    expect(res.gapBeforeMessageId).toBeNull();
  });
});
