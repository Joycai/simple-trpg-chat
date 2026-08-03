import { describe, it, expect } from "vitest";
import { BUILTIN_BOT_PRESETS } from "../bot-preset-defaults";

// Keep in sync with the agent's tool registry (`allTools` in ai_agent.ts) and
// the toggle list in BotManager.tsx. A preset referencing an unknown key would
// silently enable nothing.
const KNOWN_TOOLS = [
  "roll_dice",
  "respond_check",
  "roll_skill_check",
  "list_members",
  "give_item",
  "reveal_clue",
  "send_image",
  "inspect_item",
  "search_history",
  "my_inventory",
  "my_clues",
  "my_character",
  "set_character_card",
];

describe("BUILTIN_BOT_PRESETS", () => {
  it("ships the four predefined roles", () => {
    expect(BUILTIN_BOT_PRESETS.map(p => p.id)).toEqual([
      "builtin-coc-player",
      "builtin-coc-npc",
      "builtin-coc-assistant",
      "builtin-dnd5e-assistant",
    ]);
  });

  it("uses builtin-prefixed ids so they can never collide with DB preset ids", () => {
    for (const p of BUILTIN_BOT_PRESETS) {
      expect(p.id).toMatch(/^builtin-/);
      expect(Number.isNaN(parseInt(p.id))).toBe(true);
    }
  });

  it("has complete, non-empty fields", () => {
    for (const p of BUILTIN_BOT_PRESETS) {
      expect(p.name.trim()).not.toBe("");
      expect(p.defaultNickname.trim()).not.toBe("");
      expect(p.systemPrompt.trim()).not.toBe("");
      expect(p.allowEditPrompt).toBe(true);
      expect(p.enableTools.length).toBeGreaterThan(0);
    }
  });

  it("only references known agent tool keys, without duplicates", () => {
    for (const p of BUILTIN_BOT_PRESETS) {
      for (const tool of p.enableTools) {
        expect(KNOWN_TOOLS).toContain(tool);
      }
      expect(new Set(p.enableTools).size).toBe(p.enableTools.length);
    }
  });

  it("gives each role the tools its prompt relies on", () => {
    const byId = new Map(BUILTIN_BOT_PRESETS.map(p => [p.id, p]));
    // AI player must be able to answer checks and manage its own sheet.
    expect(byId.get("builtin-coc-player")!.enableTools).toEqual(
      expect.arrayContaining(["respond_check", "roll_skill_check", "set_character_card"])
    );
    // NPC must be able to hand over items and clues.
    expect(byId.get("builtin-coc-npc")!.enableTools).toEqual(
      expect.arrayContaining(["give_item", "reveal_clue", "list_members"])
    );
    // Assistants must be able to search history; they never write a sheet.
    for (const id of ["builtin-coc-assistant", "builtin-dnd5e-assistant"] as const) {
      expect(byId.get(id)!.enableTools).toContain("search_history");
      expect(byId.get(id)!.enableTools).not.toContain("set_character_card");
    }
  });
});
