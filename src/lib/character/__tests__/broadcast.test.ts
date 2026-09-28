import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/events", () => ({ broadcastToRoom: vi.fn() }));

import { characterUpdatePayload } from "../broadcast";
import { emptySheet } from "../sheet-v2";

describe("characterUpdatePayload", () => {
  it("carries the vital, the completion against the room rule and the writer", () => {
    const sheet = { ...emptySheet("coc7th"), attributes: { str: 60 }, resources: { hp: { current: 4 } } };
    expect(characterUpdatePayload(3, sheet, ["信用评级"], "coc7th", 1)).toEqual({
      type: "character_updated",
      userId: 3,
      vital: { key: "hp", labelKey: "hp", current: 4, max: 10, style: "bar" },
      completion: { requiredTotal: 10, requiredSet: 2 },
      by: 1,
    });
  });

  it("counts a missing sheet as nothing set", () => {
    expect(characterUpdatePayload(3, null, [], "dnd5e", null))
      .toMatchObject({ vital: null, completion: { requiredTotal: 7, requiredSet: 0 }, by: null });
  });
});
