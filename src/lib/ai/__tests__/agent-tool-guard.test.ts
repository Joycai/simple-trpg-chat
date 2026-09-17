import { describe, it, expect } from "vitest";
import { resolveToolCall } from "../agent-tool-guard";

const KNOWN = ["roll_dice", "respond_check", "give_item", "send_image"];
const ENABLED = ["roll_dice", "respond_check"];

describe("resolveToolCall", () => {
  it("accepts an enabled tool with valid JSON object arguments", () => {
    const r = resolveToolCall("roll_dice", '{"faces":100,"count":1}', ENABLED, KNOWN);
    expect(r).toEqual({ ok: true, args: { faces: 100, count: 1 } });
  });

  it("treats empty-string arguments as an empty object (no-arg tools)", () => {
    const r = resolveToolCall("respond_check", "", ENABLED, KNOWN);
    expect(r).toEqual({ ok: true, args: {} });
    const r2 = resolveToolCall("respond_check", "   ", ENABLED, KNOWN);
    expect(r2).toEqual({ ok: true, args: {} });
  });

  it("rejects a known tool that is not enabled for this bot", () => {
    const r = resolveToolCall("give_item", '{"itemId":1,"toUserId":2}', ENABLED, KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not enabled");
  });

  it("rejects a disabled write tool even with an empty enabled list", () => {
    const r = resolveToolCall("send_image", '{"imageUrl":"https://x/y.png"}', [], KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not enabled");
  });

  it("rejects an unknown/invented tool name", () => {
    const r = resolveToolCall("delete_room", "{}", ENABLED, KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown tool");
  });

  it("rejects malformed argument JSON with a correctable error", () => {
    const r = resolveToolCall("roll_dice", '{"faces":100,"cou', ENABLED, KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Malformed JSON");
  });

  it("rejects non-object JSON arguments (arrays, scalars, null)", () => {
    for (const bad of ["[1,2]", "42", '"str"', "null"]) {
      const r = resolveToolCall("roll_dice", bad, ENABLED, KNOWN);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("must be a JSON object");
    }
  });

  it("checks known-ness before enabled-ness", () => {
    // An invented name absent from both lists reports "Unknown tool", not
    // "not enabled" — the model should not be told an invented tool exists.
    const r = resolveToolCall("made_up", "{}", [], KNOWN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown tool");
  });
});
