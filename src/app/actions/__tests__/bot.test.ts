import { describe, it, expect, vi, beforeEach } from "vitest";

// The bot write actions return `{ success, error }` with a localized error
// instead of throwing (Next.js redacts thrown messages in production).

const tryRoomAccess = vi.fn();
vi.mock("@/lib/auth/room-access", () => ({
  tryRoomAccess: (...a: unknown[]) => tryRoomAccess(...a),
  checkRoomAccess: vi.fn(),
}));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rules", () => ({ getRuleForRoom: () => ({ id: "basic" }) }));
const runAgent = vi.fn(() => Promise.resolve());
vi.mock("@/lib/ai/agent", () => ({ runAgent: () => runAgent() }));
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
const update = vi.fn(() => chain(() => []));
const insert = vi.fn(() => chain(() => [{ id: 42 }]));
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({ insert }));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(() => selectQueue.shift() ?? []),
    update: () => update(),
    transaction: (fn: (tx: unknown) => unknown) => transaction(fn),
  },
}));

import { createBotAction, updateBotAction, triggerBotAction } from "../bot";

const data = { name: "KP", nickname: "kp", systemPrompt: "p", model: "m", activation: "@mention" };

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  tryRoomAccess.mockResolvedValue({ userId: 1, isHost: true, isAdmin: false });
});

describe("createBotAction", () => {
  it("rejects a caller who is not the host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await createBotAction(5, data)).toEqual({ success: false, error: "roomActions.errorNoAccess" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("creates the bot user and its membership", async () => {
    selectQueue = [[{ ruleTemplate: "basic" }]];
    expect(await createBotAction(5, data)).toEqual({ success: true });
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

describe("updateBotAction", () => {
  it("rejects a caller who is not the host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await updateBotAction(5, 9, data)).toEqual({ success: false, error: "roomActions.errorNoAccess" });
  });

  it("reports a missing bot", async () => {
    selectQueue = [[]];
    expect(await updateBotAction(5, 9, data)).toEqual({ success: false, error: "bots.errorBotNotFound" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a human user id", async () => {
    selectQueue = [[{ id: 9, isBot: false }]];
    expect(await updateBotAction(5, 9, data)).toEqual({ success: false, error: "bots.errorBotNotFound" });
  });

  it("refuses a bot from another room", async () => {
    selectQueue = [[{ id: 9, isBot: true, botConfigJson: "{}" }], []];
    expect(await updateBotAction(5, 9, data)).toEqual({ success: false, error: "bots.errorBotNotMember" });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates a bot in this room", async () => {
    selectQueue = [[{ id: 9, isBot: true, botConfigJson: "{}" }], [{ id: 3 }]];
    expect(await updateBotAction(5, 9, data)).toEqual({ success: true });
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("triggerBotAction", () => {
  it("rejects a caller who is not the host", async () => {
    tryRoomAccess.mockResolvedValue(null);
    expect(await triggerBotAction(5, 9)).toEqual({ success: false, error: "roomActions.errorNoAccess" });
  });

  it("starts the agent for the host", async () => {
    expect(await triggerBotAction(5, 9)).toEqual({ success: true });
  });
});
