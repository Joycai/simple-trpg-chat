import { describe, it, expect } from "vitest";
import {
  ROOM_HOTKEYS,
  matchRoomHotkey,
  isPrintableKey,
  keyCapForCode,
  formatHotkey,
} from "@/lib/hotkeys";

const combo = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("matchRoomHotkey", () => {
  it("maps Alt+letter to the bound action", () => {
    expect(matchRoomHotkey(combo("KeyC"), false)).toBe("toggle-character");
    expect(matchRoomHotkey(combo("KeyB"), false)).toBe("toggle-inventory");
    expect(matchRoomHotkey(combo("KeyN"), false)).toBe("toggle-notebook");
    expect(matchRoomHotkey(combo("KeyV"), false)).toBe("toggle-events");
    expect(matchRoomHotkey(combo("KeyM"), false)).toBe("toggle-sidebar");
    expect(matchRoomHotkey(combo("KeyR"), false)).toBe("toggle-dice");
    expect(matchRoomHotkey(combo("ArrowUp"), false)).toBe("prev-tab");
    expect(matchRoomHotkey(combo("ArrowDown"), false)).toBe("next-tab");
    expect(matchRoomHotkey(combo("Slash"), false)).toBe("help");
  });

  it("requires Alt and rejects other command modifiers", () => {
    expect(matchRoomHotkey(combo("KeyC", { altKey: false }), true)).toBeNull();
    expect(matchRoomHotkey(combo("KeyC", { ctrlKey: true }), true)).toBeNull();
    expect(matchRoomHotkey(combo("KeyC", { metaKey: true }), true)).toBeNull();
    expect(matchRoomHotkey(combo("KeyC", { shiftKey: true }), true)).toBeNull();
  });

  it("gates host-only bindings on isHost", () => {
    for (const code of ["KeyK", "KeyI", "KeyT"]) {
      expect(matchRoomHotkey(combo(code), false)).toBeNull();
      expect(matchRoomHotkey(combo(code), true)).not.toBeNull();
    }
  });

  it("returns null for unbound keys", () => {
    expect(matchRoomHotkey(combo("KeyZ"), true)).toBeNull();
    expect(matchRoomHotkey(combo("Enter"), true)).toBeNull();
  });

  it("never binds browser-reserved Alt combos (address bar / menus)", () => {
    for (const reserved of ["KeyD", "KeyE", "KeyF"]) {
      expect(ROOM_HOTKEYS.some((b) => b.code === reserved)).toBe(false);
    }
  });
});

describe("isPrintableKey", () => {
  const key = (key: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });

  it("accepts bare single characters", () => {
    expect(isPrintableKey(key("a"))).toBe(true);
    expect(isPrintableKey(key("."))).toBe(true);
    expect(isPrintableKey(key("1"))).toBe(true);
  });

  it("rejects modifier combos and non-character keys", () => {
    expect(isPrintableKey(key("a", { ctrlKey: true }))).toBe(false);
    expect(isPrintableKey(key("a", { altKey: true }))).toBe(false);
    expect(isPrintableKey(key("a", { metaKey: true }))).toBe(false);
    expect(isPrintableKey(key("Enter"))).toBe(false);
    expect(isPrintableKey(key("Escape"))).toBe(false);
    // IME composition keydowns report "Process"
    expect(isPrintableKey(key("Process"))).toBe(false);
  });
});

describe("hotkey labels", () => {
  it("renders displayable key caps", () => {
    expect(keyCapForCode("KeyC")).toBe("C");
    expect(keyCapForCode("ArrowUp")).toBe("↑");
    expect(keyCapForCode("Slash")).toBe("/");
  });

  it("formats per platform", () => {
    expect(formatHotkey("KeyC", false)).toBe("Alt+C");
    expect(formatHotkey("KeyC", true)).toBe("⌥C");
    expect(formatHotkey("ArrowDown", false)).toBe("Alt+↓");
  });
});
