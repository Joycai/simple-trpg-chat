/**
 * Room keyboard shortcuts — the single source of truth for every binding.
 *
 * All panel/menu shortcuts are Alt+key (⌥ on macOS) so they work even while
 * the chat textarea is focused, and are matched on `e.code` (physical key) so
 * they are IME- and layout-independent. Chrome/Edge/Firefox reserve Alt+D /
 * Alt+E / Alt+F on Windows for the address bar and browser menus — those codes
 * must never be bound here.
 *
 * The table below drives both the matcher (`matchRoomHotkey`) and the help
 * overlay (`RoomHotkeyHelp`), so a new shortcut is one row + one i18n key.
 */

export type RoomHotkeyAction =
  | "toggle-character"
  | "toggle-inventory"
  | "toggle-notebook"
  | "toggle-events"
  | "toggle-sidebar"
  | "toggle-dice"
  | "toggle-quick-check"
  | "toggle-check"
  | "toggle-item-manager"
  | "toggle-timeline"
  | "prev-tab"
  | "next-tab"
  | "help";

export interface RoomHotkeyBinding {
  /** Physical key (`KeyboardEvent.code`), always combined with Alt. */
  code: string;
  action: RoomHotkeyAction;
  hostOnly: boolean;
  /** Key under the `hotkeys` i18n namespace naming the action. */
  labelKey: string;
}

export const ROOM_HOTKEYS: readonly RoomHotkeyBinding[] = [
  { code: "KeyC", action: "toggle-character", hostOnly: false, labelKey: "character" },
  { code: "KeyB", action: "toggle-inventory", hostOnly: false, labelKey: "inventory" },
  { code: "KeyN", action: "toggle-notebook", hostOnly: false, labelKey: "notebook" },
  { code: "KeyV", action: "toggle-events", hostOnly: false, labelKey: "events" },
  { code: "KeyM", action: "toggle-sidebar", hostOnly: false, labelKey: "sidebar" },
  { code: "KeyR", action: "toggle-dice", hostOnly: false, labelKey: "dice" },
  { code: "KeyQ", action: "toggle-quick-check", hostOnly: false, labelKey: "quickCheck" },
  { code: "KeyK", action: "toggle-check", hostOnly: true, labelKey: "check" },
  { code: "KeyI", action: "toggle-item-manager", hostOnly: true, labelKey: "itemManager" },
  { code: "KeyT", action: "toggle-timeline", hostOnly: true, labelKey: "timeline" },
  { code: "ArrowUp", action: "prev-tab", hostOnly: false, labelKey: "prevTab" },
  { code: "ArrowDown", action: "next-tab", hostOnly: false, labelKey: "nextTab" },
  { code: "Slash", action: "help", hostOnly: false, labelKey: "help" },
];

interface KeyComboLike {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Resolve a keydown into a room action, or null if it isn't one of ours. */
export function matchRoomHotkey(e: KeyComboLike, isHost: boolean): RoomHotkeyAction | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const binding = ROOM_HOTKEYS.find((b) => b.code === e.code);
  if (!binding) return null;
  if (binding.hostOnly && !isHost) return null;
  return binding.action;
}

/**
 * True for a bare printable keystroke (single character, no command modifier)
 * — the "start typing anywhere to focus the chat input" trigger. IME keydowns
 * report `key: "Process"` and fail the length check, so they never match.
 */
export function isPrintableKey(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  return e.key.length === 1;
}

/** True when the event target already consumes keystrokes. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent || "");
}

/** "KeyC" → "C", "ArrowUp" → "↑", "Slash" → "/" — the displayable key cap. */
export function keyCapForCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "Slash") return "/";
  return code;
}

/** Human label for an Alt-combo: "Alt+C", or "⌥C" on Apple platforms. */
export function formatHotkey(code: string, isMac: boolean = isMacPlatform()): string {
  const cap = keyCapForCode(code);
  return isMac ? `⌥${cap}` : `Alt+${cap}`;
}

/** Attribute + selector marking the room chat textarea for focus-to-type. */
export const CHAT_INPUT_ATTR = "data-chat-input";
export const CHAT_INPUT_SELECTOR = `textarea[${CHAT_INPUT_ATTR}]`;

/** Window CustomEvent asking the ChatInput to toggle its dice panel. */
export const TOGGLE_DICE_EVENT = "trpg:toggle-dice";

/** Window CustomEvent asking the ChatInput to toggle the quick-check panel. */
export const TOGGLE_QUICK_CHECK_EVENT = "trpg:toggle-quick-check";

/** localStorage flag: the one-time "shortcuts are available" toast was seen
 *  (shown once per browser, dismissed by closing it or opening the help). */
export const HOTKEY_HINT_SEEN_KEY = "strpg:hotkey-hint-seen";
