"use client";

import { useEffect, useRef } from "react";
import {
  matchRoomHotkey,
  isPrintableKey,
  isEditableTarget,
  CHAT_INPUT_SELECTOR,
  type RoomHotkeyAction,
} from "@/lib/hotkeys";
import { hasOpenOverlay } from "@/lib/overlay-esc";

interface UseRoomHotkeysOptions {
  isHost: boolean;
  /** Frozen-room player or admin observer — disables focus-to-type (no input). */
  readOnly: boolean;
  /** Run a matched Alt-combo action (already host-gated by the matcher). */
  onAction: (action: RoomHotkeyAction) => void;
  /** Escape pressed with no overlay open — close any open top-bar dropdown. */
  onEscape: () => void;
}

/**
 * Room-wide keyboard shortcuts. One document-level listener that:
 *  1. resolves Alt-combos into panel/menu actions (`@/lib/hotkeys`),
 *  2. routes Escape to the top-bar dropdowns — but only when no overlay is
 *     mounted, since overlays own Escape through the shared stack,
 *  3. focuses the chat input on any bare printable keystroke, so typing
 *     "just works" without clicking the textarea first (the keystroke itself
 *     lands in the input — focus shifts during keydown, before the character
 *     is inserted).
 *
 * Options are read through a ref so the listener registers exactly once.
 */
export function useRoomHotkeys(options: UseRoomHotkeysOptions): void {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const { isHost, readOnly, onAction, onEscape } = optionsRef.current;

      const action = matchRoomHotkey(e, isHost);
      if (action) {
        // Stop the browser from treating the combo as a menu accelerator.
        e.preventDefault();
        onAction(action);
        return;
      }

      if (e.key === "Escape") {
        if (!hasOpenOverlay()) onEscape();
        return;
      }

      // Focus-to-type. Deliberately NOT preventDefault: the browser inserts
      // the pressed character into the newly focused textarea itself.
      if (readOnly || hasOpenOverlay()) return;
      if (!isPrintableKey(e) || isEditableTarget(e.target)) return;
      document.querySelector<HTMLTextAreaElement>(CHAT_INPUT_SELECTOR)?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
