"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEscapeToClose } from "@/lib/overlay-esc";

/**
 * Exit-animation length. Must stay in sync with `--overlay-exit-dur`
 * in src/app/globals.css.
 */
const EXIT_DURATION = 260;

export type OverlayVariant = "drawer" | "modal";

export interface OverlayTransitionOptions {
  /**
   * Escape closes the topmost overlay by default (same animated `close` the
   * backdrop uses). Set false for overlays that must not dismiss this way —
   * forced gates, or panels with their own dirty-state guard, which should
   * register that guard via `useEscapeToClose` themselves.
   */
  closeOnEscape?: boolean;
}

/**
 * Drives enter/exit transitions for overlays whose mount is owned by a parent
 * boolean (the common `{showX && <Panel onClose={...} />}` pattern).
 *
 * The enter animation runs automatically from a CSS keyframe on mount. Closing
 * is deferred: `close()` flips the panel into its `--closing` state (playing the
 * reverse keyframe) and only calls the real `onClose` once the exit animation
 * has finished, so the parent unmounts after — not before — the motion plays.
 *
 * Call `close()` everywhere the panel would have called `onClose` (close button,
 * backdrop click, cancel, post-save). The returned class strings carry the
 * enter keyframe and, while closing, the exit keyframe.
 */
export function useOverlayTransition(
  onClose: () => void,
  variant: OverlayVariant = "modal",
  { closeOnEscape = true }: OverlayTransitionOptions = {},
) {
  const [closing, setClosing] = useState(false);
  const closedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(onClose, EXIT_DURATION);
  }, [onClose]);

  useEscapeToClose(close, closeOnEscape);

  // Clean up the pending timer if the parent unmounts us for another reason.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const backdropClass = `overlay-backdrop${closing ? " overlay-backdrop--closing" : ""}`;
  const panelClass =
    variant === "drawer"
      ? `overlay-drawer${closing ? " overlay-drawer--closing" : ""}`
      : `overlay-modal${closing ? " overlay-modal--closing" : ""}`;

  return { closing, close, backdropClass, panelClass };
}
