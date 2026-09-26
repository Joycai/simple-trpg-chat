import { describe, it, expect, vi, beforeEach } from "vitest";

// The message write actions return `{ success, error }` with a localized error
// instead of throwing (Next.js redacts thrown messages in production).

const tryRoomAccess = vi.fn();
vi.mock("@/lib/auth/room-access", () => ({
  tryRoomAccess: (...a: unknown[]) => tryRoomAccess(...a),
  checkRoomAccess: vi.fn(),
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
  for (const m of ["from", "where", "innerJoin"]) c[m] = () => c;
  c.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  return c;
}
const del = vi.fn(() => chain(() => []));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    delete: () => del(),
  },
  sqlNow: vi.fn(),
}));

import {
  sendMessageAction, rollDiceAction, insertTimelineDividerAction,
  withdrawTimelineDividerAction, executeCommandAction,
} from "../messages";
import { MESSAGE_MAX_LENGTH } from "@/lib/room/limits";

const NO_ACCESS = { success: false, error: "roomActions.errorNoAccess" };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  session = { user: { id: "2", role: "player" } };
  tryRoomAccess.mockResolvedValue({ userId: 2, isHost: false, isAdmin: false });
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

  it("passes the engine's result through", async () => {
    executeCommand.mockResolvedValue({ isCommand: true, success: true });
    expect(await executeCommandAction(5, 2, ".r d6")).toEqual({ isCommand: true, success: true });
  });
});
