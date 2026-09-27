"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { HOTKEY_HINT_SEEN_KEY, formatHotkey } from "@/lib/ui/hotkeys";

/**
 * External store for the one-time hotkey-discoverability toast. Persisted in
 * localStorage per browser (not per room). `getSnapshot` also gates on a fine
 * pointer, so touch-only devices — where the shortcuts don't exist — never see
 * the toast. `markSeen` notifies same-tab subscribers directly, since the
 * native `storage` event only fires cross-tab.
 */
export const hotkeyHintStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    hotkeyHintStore.listeners.add(cb);
    return () => {
      hotkeyHintStore.listeners.delete(cb);
    };
  },
  getSnapshot(): boolean {
    try {
      return (
        !window.localStorage.getItem(HOTKEY_HINT_SEEN_KEY) &&
        window.matchMedia("(pointer: fine)").matches
      );
    } catch {
      return false;
    }
  },
  getServerSnapshot(): boolean {
    return false;
  },
  markSeen() {
    try {
      window.localStorage.setItem(HOTKEY_HINT_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    hotkeyHintStore.listeners.forEach((l) => l());
  },
};

/**
 * One-time discoverability toast for the hotkey system. Read via
 * useSyncExternalStore (same pattern as RoomTopBar's event badge): no
 * setState-in-effect, no hydration flash — the server snapshot is always
 * "seen" (toast hidden). Desktop only; retired for good once the user closes
 * it or opens the help sheet by any path (Alt+/, gear menu, the toast).
 */
export function HotkeyHintToast({ onOpenHelp }: { onOpenHelp: () => void }) {
  const tHotkeys = useTranslations("hotkeys");
  const show = useSyncExternalStore(
    hotkeyHintStore.subscribe,
    hotkeyHintStore.getSnapshot,
    hotkeyHintStore.getServerSnapshot,
  );
  if (!show) return null;
  return (
    <div className="fixed bottom-24 right-4 z-30 flex items-center gap-2.5 bg-surface theme-border rounded-theme shadow-xl pl-3.5 pr-2 py-2.5 overlay-pop"
      style={{ transformOrigin: "bottom right", "--overlay-pop-y": "6px" } as React.CSSProperties} role="status">
      <Icons.Keyboard className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm text-text">{tHotkeys("hintText")}</span>
      <button
        onClick={onOpenHelp}
        className="text-sm font-bold text-primary hover:text-primary-hover transition cursor-pointer whitespace-nowrap"
      >
        {tHotkeys("hintAction", { key: formatHotkey("Slash") })}
      </button>
      <button
        onClick={() => hotkeyHintStore.markSeen()}
        className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer"
        aria-label={tHotkeys("hintDismiss")}
      >
        <Icons.X className="w-4 h-4" />
      </button>
    </div>
  );
}
