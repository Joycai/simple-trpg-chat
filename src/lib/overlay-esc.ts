"use client";

import { useEffect, useRef } from "react";

/**
 * Module-level stack of every mounted overlay that opted into Escape-to-close
 * (topmost = last mounted). It lives here rather than in component state so
 * independently mounted overlays — OverlayShell wrappers, panels calling
 * useOverlayTransition directly, and self-contained pickers — agree on which
 * one owns the next Escape press: only the top of the stack closes.
 */
const stack: symbol[] = [];

/** True while any Escape-closable overlay is mounted (used by the room hotkey
 *  hook to leave Escape to the overlay layer instead of the top-bar menus). */
export function hasOpenOverlay(): boolean {
  return stack.length > 0;
}

/**
 * Close `onEscape` when Escape is pressed while this overlay is topmost.
 * Pass `enabled: false` for overlays that must not dismiss (forced gates) —
 * they then don't join the stack at all, so Escape falls through to the
 * overlay beneath them.
 *
 * The handler is kept in a ref so callers may pass a fresh closure each render
 * (the usual case) without re-registering the listener.
 */
export function useEscapeToClose(onEscape: () => void, enabled: boolean = true): void {
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  });

  useEffect(() => {
    if (!enabled) return;
    const id = Symbol("overlay");
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (stack[stack.length - 1] !== id) return;
      e.preventDefault();
      handlerRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled]);
}
