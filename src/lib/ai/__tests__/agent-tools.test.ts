import { describe, it, expect, vi } from "vitest";

// The handler module pulls in the DB client and server-only helpers; only its
// table of names is under test here.
vi.mock("@/db", () => ({ db: {}, sqlNow: vi.fn() }));
vi.mock("@/lib/messaging/router", () => ({ dispatchMessage: vi.fn(), messageVisibilityWhere: vi.fn() }));
vi.mock("@/lib/room/inventory-share", () => ({ shareItemCore: vi.fn() }));
vi.mock("@/lib/commands/engine", () => ({ executeCommand: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { buildAgentToolDefinitions } from "../agent-tool-definitions";
import { AGENT_TOOL_HANDLERS } from "../agent-tool-handlers";

describe("agent tool table", () => {
  it("has exactly one handler per advertised tool definition", () => {
    const defined = buildAgentToolDefinitions(1).map((t) => t.function.name).sort();
    expect([...AGENT_TOOL_HANDLERS.keys()].sort()).toEqual(defined);
    expect(new Set(defined).size).toBe(defined.length);
  });

  it("interpolates the room id into send_image's description", () => {
    const sendImage = buildAgentToolDefinitions(42).find((t) => t.function.name === "send_image");
    expect(sendImage?.function.description).toContain("/api/rooms/42/images/");
  });
});
