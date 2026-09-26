import { describe, it, expect, vi, beforeEach } from "vitest";

// respond_check must roll a 狩魂者 request with the host's DC and 时髦骰, the
// same command a player's response gets (actions/checks.ts).

let candidates: unknown[] = [];
function chain(rows: () => unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "set"]) c[m] = () => c;
  c.then = (resolve: (r: unknown[]) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows()).then(resolve, reject);
  return c;
}
vi.mock("@/db", () => ({
  db: { select: () => chain(() => candidates), update: () => chain(() => []) },
  sqlNow: vi.fn(),
}));
vi.mock("@/lib/messaging/router", () => ({ dispatchMessage: vi.fn(), messageVisibilityWhere: vi.fn() }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));
vi.mock("@/lib/room/inventory-share", () => ({ shareItemCore: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
const executeCommand = vi.fn(async (..._a: unknown[]) => ({ success: true, isCommand: true, message: { content: "结果" } }));
vi.mock("@/lib/commands/engine", () => ({ executeCommand: (...a: unknown[]) => executeCommand(...a) }));

import { AGENT_TOOL_HANDLERS } from "../agent-tool-handlers";
import type { AgentToolContext } from "../agent-tool-handlers";

const BOT_ID = 50;
const HOST_ID = 1;

function request(checkRequest: Record<string, unknown>) {
  candidates = [{
    id: 900, isPrivate: false, audience: "everyone", userId: HOST_ID, targetUserId: null,
    diceDetail: JSON.stringify({ checkRequest: { targetUserIds: [BOT_ID], respondedUserIds: [], hostNick: "KP", ...checkRequest } }),
  }];
}

function respond(args: Record<string, unknown>, ruleTemplate: string) {
  const ctx = {
    roomId: 10, botUserId: BOT_ID, botNickname: "阿尔法", replyIsPrivate: false, targetUserId: HOST_ID,
    room: { id: 10, hostId: HOST_ID, ruleTemplate },
  } as unknown as AgentToolContext;
  return AGENT_TOOL_HANDLERS.get("respond_check")!(args, ctx);
}

const sentCommand = () => executeCommand.mock.calls[0][2];

beforeEach(() => executeCommand.mockClear());

describe("respond_check tool", () => {
  it("rolls a 狩魂者 request with the host's DC and 时髦骰", async () => {
    request({ skillName: "侦查", diceType: "d100", shCheck: { dc: 15, styleDice: -2 } });
    const result = await respond({}, "shouhun");
    expect(sentCommand()).toBe(".rc 侦查+0-2 15");
    expect(result).toMatchObject({ success: true, skillName: "侦查" });
  });

  it("uses the bot's 加骰 count, floored and clamped to the rule's maximum", async () => {
    request({ skillName: "侦查", diceType: "d100", shCheck: { dc: 15, styleDice: 1 } });
    await respond({ bonusDice: 3.7 }, "shouhun");
    expect(sentCommand()).toBe(".rc 侦查+3+1 15");

    executeCommand.mockClear();
    request({ skillName: "侦查", diceType: "d100", shCheck: { dc: null, styleDice: 0 } });
    await respond({ bonusDice: 99 }, "shouhun");
    expect(sentCommand()).toBe(".rc 侦查+20 10");
  });

  it("keeps the plain .rc for ordinary check requests", async () => {
    request({ skillName: "侦查", diceType: "d100" });
    await respond({ bonusDice: 3 }, "coc7th");
    expect(sentCommand()).toBe(".rc 侦查");
  });
});
