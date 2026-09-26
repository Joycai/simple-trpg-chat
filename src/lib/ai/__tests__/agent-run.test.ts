import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rooms, users, roomMembers, systemConfig, aiProviders } from "@/db/schema";

// Characterization of runAgent's control flow: the guard clauses that skip a
// run, the reply channel, the typing events, and token accounting across the
// model↔tool loop. Only runAgent is driven; its collaborators are mocked.

// db.select() chains resolve by table, so a test states what each table holds
// instead of depending on query order (runAgent loads three in parallel).
// A table with queued results answers successive queries in turn (e.g. the
// bot's user row, then the host's), then falls back to tableRows.
const tableRows = new Map<unknown, unknown[]>();
const tableQueue = new Map<unknown, unknown[][]>();
const selectSpy = vi.fn();
function chain(table?: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["where", "orderBy", "limit"]) c[m] = () => c;
  c.from = (t: unknown) => chain(t);
  c.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(tableQueue.get(table)?.shift() ?? tableRows.get(table) ?? []).then(resolve, reject);
  return c;
}
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => { selectSpy(...args); return chain(); },
    query: { inventoryDistributions: { findMany: vi.fn(async () => []) } },
    update: vi.fn(),
  },
}));

const dispatchMessage = vi.fn(async (_args: Record<string, unknown>) => ({ id: 1 }));
vi.mock("@/lib/messaging/router", () => ({
  dispatchMessage: (args: Record<string, unknown>) => dispatchMessage(args),
  messageVisibilityWhere: vi.fn(),
}));

const broadcastToRoom = vi.fn();
const emitToUser = vi.fn();
vi.mock("@/lib/server/events", () => ({
  broadcastToRoom: (...a: unknown[]) => broadcastToRoom(...a),
  emitToUser: (...a: unknown[]) => emitToUser(...a),
}));

const recordTokenUsage = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/ai/usage", () => ({ recordTokenUsage: (...a: unknown[]) => recordTokenUsage(...a) }));
vi.mock("@/lib/security/encryption", () => ({ decrypt: () => "sk-test" }));
vi.mock("@/lib/security/url-guard", () => ({ validateApiEndpoint: async () => ({ valid: true }) }));
vi.mock("@/lib/security/sensitive-words", () => ({ checkSensitiveWords: async () => null }));

vi.mock("@/lib/ai/agent-tool-definitions", () => ({
  buildAgentToolDefinitions: () => [
    { type: "function", function: { name: "roll_dice", description: "", parameters: { type: "object", properties: {} } } },
  ],
}));
const rollDiceHandler = vi.fn(async (..._a: unknown[]) => ({ success: true, total: 7 }));
vi.mock("@/lib/ai/agent-tool-handlers", () => ({
  AGENT_TOOL_HANDLERS: new Map([["roll_dice", (...a: unknown[]) => rollDiceHandler(...a)]]),
}));

import { runAgent } from "../agent";

const ROOM_ID = 10;
const BOT_ID = 50;
const HOST_ID = 1;
const PLAYER_ID = 7;
const PROVIDER_ID = 3;

function seed(overrides: {
  aiEnabled?: string;
  provider?: Partial<{ ownerId: number; isShared: boolean }>;
  host?: Partial<{ role: string; aiPoints: number }>;
} = {}) {
  tableRows.clear();
  tableQueue.clear();
  tableRows.set(rooms, [{ id: ROOM_ID, hostId: HOST_ID, ruleTemplate: "basic" }]);
  const botRow = {
    id: BOT_ID, displayName: "Bot", isBot: true, role: "player", aiPoints: 100,
    botConfigJson: JSON.stringify({ providerId: PROVIDER_ID, model: "m" }),
  };
  const hostRow = { id: HOST_ID, isBot: false, role: "host", aiPoints: 100, ...overrides.host };
  tableRows.set(users, [botRow]);
  // runAgent reads users twice when the provider is shared: the bot, then the host.
  tableQueue.set(users, [[botRow], [hostRow]]);
  tableRows.set(roomMembers, [{ roomId: ROOM_ID, userId: BOT_ID, nickname: "阿尔法" }]);
  tableRows.set(systemConfig, [{ key: "ai_enabled", value: overrides.aiEnabled ?? "true" }]);
  tableRows.set(aiProviders, [{
    id: PROVIDER_ID, ownerId: HOST_ID, isShared: false, apiKeyEncrypted: "x", apiEndpoint: "https://ai.example",
    ...overrides.provider,
  }]);
}

type Completion = { content?: string | null; tool_calls?: unknown[]; finish_reason?: string; usage?: Record<string, unknown> };
const fetchMock = vi.fn();
function queueCompletions(...turns: (Completion | { status: number })[]) {
  for (const turn of turns) {
    if ("status" in turn) {
      fetchMock.mockResolvedValueOnce(new Response("bad request", { status: turn.status }));
      continue;
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: turn.content ?? null, tool_calls: turn.tool_calls }, finish_reason: turn.finish_reason ?? "stop" }],
      usage: turn.usage,
    }), { status: 200 }));
  }
}

const typingEvents = (spy: typeof broadcastToRoom) =>
  spy.mock.calls.map((c) => c[c.length - 1] as { type?: string; typing?: boolean }).filter((e) => e?.type === "typing");

/** runAgent fires the history summarizer without awaiting it; let it settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  globalThis.__agentCooldowns?.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  seed();
});
afterEach(async () => {
  await settle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  for (const spy of [selectSpy, dispatchMessage, broadcastToRoom, emitToUser, recordTokenUsage, rollDiceHandler]) spy.mockClear();
});

describe("runAgent", () => {
  it("T1: a second trigger inside the 3s cooldown skips before touching the db", async () => {
    seed({ aiEnabled: "false" });
    await runAgent(BOT_ID, ROOM_ID);
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockClear();

    await runAgent(BOT_ID, ROOM_ID);
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("T2: skips the model call when AI is globally disabled", async () => {
    seed({ aiEnabled: "false" });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(dispatchMessage).not.toHaveBeenCalled();
  });

  it("T3: skips a provider neither owned by the host nor shared", async () => {
    seed({ provider: { ownerId: 999, isShared: false } });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("T4: skips a shared provider when the host's points are spent", async () => {
    seed({ provider: { ownerId: 999, isShared: true }, host: { aiPoints: 0 } });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("T4b: runs on a shared provider while the host has points (the bot's own points don't matter)", async () => {
    seed({ provider: { ownerId: 999, isShared: true }, host: { aiPoints: 5 } });
    queueCompletions({ content: "ok", usage: { prompt_tokens: 1, completion_tokens: 1 } });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("T5: one reply without tools — says it once, bills its tokens, typing on then off", async () => {
    queueCompletions({ content: "你好", usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens: 5 } });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    expect(dispatchMessage.mock.calls[0][0]).toMatchObject({
      roomId: ROOM_ID, actorUserId: BOT_ID, nickname: "阿尔法", type: "text", audience: "everyone", targetUserId: null, content: "你好",
    });
    expect(recordTokenUsage).toHaveBeenCalledWith(HOST_ID, PROVIDER_ID, 10, 2, 5);
    expect(typingEvents(broadcastToRoom).map((e) => e.typing)).toEqual([true, false]);
    expect(emitToUser).not.toHaveBeenCalled();
  });

  it("T6: a tool round then a reply — runs the tool once and bills both rounds", async () => {
    queueCompletions(
      { tool_calls: [{ id: "c1", type: "function", function: { name: "roll_dice", arguments: "{}" } }], finish_reason: "tool_calls",
        usage: { prompt_tokens: 10, completion_tokens: 5 } },
      { content: "掷出了 7", usage: { prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 4 }, completion_tokens: 7 } },
    );
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });

    expect(rollDiceHandler).toHaveBeenCalledTimes(1);
    expect(rollDiceHandler.mock.calls[0][1]).toMatchObject({ roomId: ROOM_ID, botUserId: BOT_ID, botNickname: "阿尔法", replyIsPrivate: false, targetUserId: PLAYER_ID });
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1", content: JSON.stringify({ success: true, total: 7 }) });
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    expect(dispatchMessage.mock.calls[0][0]).toMatchObject({ content: "掷出了 7" });
    expect(recordTokenUsage).toHaveBeenCalledTimes(1);
    expect(recordTokenUsage).toHaveBeenCalledWith(HOST_ID, PROVIDER_ID, 30, 4, 12);
  });

  it("T7: a failed second round posts an error and still bills the first round", async () => {
    queueCompletions(
      { tool_calls: [{ id: "c1", type: "function", function: { name: "roll_dice", arguments: "{}" } }], finish_reason: "tool_calls",
        usage: { prompt_tokens: 10, completion_tokens: 5 } },
      { status: 400 },
    );
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispatchMessage).toHaveBeenCalledTimes(1);
    expect(dispatchMessage.mock.calls[0][0].content).toMatch(/^\(阿尔法\) encountered an error connecting to AI: AI API error \(400\)/);
    expect(recordTokenUsage).toHaveBeenCalledWith(HOST_ID, PROVIDER_ID, 10, 0, 5);
    expect(typingEvents(broadcastToRoom).map((e) => e.typing)).toEqual([true, false]);
  });

  it("T9: a throw inside the loop still bills every round so far and stops typing", async () => {
    queueCompletions(
      { tool_calls: [{ id: "c1", type: "function", function: { name: "roll_dice", arguments: "{}" } }], finish_reason: "tool_calls",
        usage: { prompt_tokens: 10, completion_tokens: 5 } },
      { content: "掷出了 7", usage: { prompt_tokens: 20, completion_tokens: 7 } },
    );
    dispatchMessage.mockRejectedValueOnce(new Error("db down"));
    await expect(runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: false })).rejects.toThrow("db down");

    expect(recordTokenUsage).toHaveBeenCalledWith(HOST_ID, PROVIDER_ID, 30, 0, 12);
    expect(typingEvents(broadcastToRoom).map((e) => e.typing)).toEqual([true, false]);
  });

  it("T8: a DM trigger replies in the DM and sends typing only to the pair and the host", async () => {
    queueCompletions({ content: "悄悄话", usage: { prompt_tokens: 1, completion_tokens: 1 } });
    await runAgent(BOT_ID, ROOM_ID, { triggeringUserId: PLAYER_ID, isPrivate: true });

    expect(typingEvents(broadcastToRoom)).toEqual([]);
    const typingTo = emitToUser.mock.calls.map((c) => [c[1], (c[2] as { typing: boolean }).typing]);
    expect(typingTo).toEqual([[PLAYER_ID, true], [HOST_ID, true], [PLAYER_ID, false], [HOST_ID, false]]);
    expect(emitToUser.mock.calls[0][2]).toMatchObject({ type: "typing", botUserId: BOT_ID, nickname: "阿尔法", isPrivate: true, targetUserId: PLAYER_ID, userId: BOT_ID });
    expect(dispatchMessage.mock.calls[0][0]).toMatchObject({ audience: "dm", targetUserId: PLAYER_ID, content: "悄悄话" });
  });
});
