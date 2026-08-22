"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayTransition, type OverlayVariant } from "@/lib/useOverlayTransition";

interface OverlayShellProps {
  /** Real close handler — invoked after the exit animation finishes. */
  onClose: () => void;
  /** `modal` centers + scales; `drawer` slides in from the right edge. */
  variant?: OverlayVariant;
  /** Classes for the panel/card itself (size, surface, padding…). */
  panelClassName: string;
  /** Extra classes for the root layer (centered modal only). */
  rootClassName?: string;
  /** Whether clicking the backdrop closes the overlay (default true). */
  closeOnBackdrop?: boolean;
  /** Whether Escape closes the overlay (defaults to `closeOnBackdrop`, so a
   *  non-dismissable overlay stays non-dismissable on both paths). */
  closeOnEscape?: boolean;
  /**
   * Render into `document.body` instead of in place. Required for a centered
   * modal opened from inside a drawer/modal: an ancestor's enter/exit
   * `transform` becomes the containing block for `position: fixed`, which would
   * otherwise center this overlay within that ancestor rather than the screen.
   */
  portal?: boolean;
  /**
   * Mount-time work to run once the enter animation has settled — typically a
   * server action that ends in `revalidatePath`, whose response re-renders the
   * whole route and would otherwise stall the slide. Captured on mount, so it
   * must not depend on later props.
   */
  onEntered?: () => void;
  /**
   * Receives the animated `close` so inner controls can trigger the exit, and
   * `afterEnter` so content can defer its own heavy commits (see
   * `useOverlayTransition`).
   */
  children: (close: () => void, afterEnter: (fn: () => void) => void) => ReactNode;
}

/**
 * Thin wrapper that gives an inline overlay the same Apple-style enter/exit
 * motion as the standalone panels, without extracting it into its own file.
 * Used for the lightweight modals declared inline in RoomClient.
 */
export function OverlayShell({
  onClose,
  variant = "modal",
  panelClassName,
  rootClassName = "",
  closeOnBackdrop = true,
  closeOnEscape = closeOnBackdrop,
  portal = false,
  onEntered,
  children,
}: OverlayShellProps) {
  const { close, panelRef, backdropRef, panelClass, afterEnter } = useOverlayTransition(
    onClose,
    variant,
    { closeOnEscape },
  );

  // Mount-only: `panelRef` has already run by the time effects fire, so the
  // enter is either in flight (queued) or was skipped for reduced motion
  // (immediate). Re-registering on every render would queue duplicates.
  useEffect(() => {
    if (onEntered) afterEnter(onEntered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // These overlays mount only on client interaction (never during SSR), so a
  // one-shot check for `document` is enough to portal — no effect needed, which
  // keeps clear of the set-state-in-effect lint rule.
  const [canPortal] = useState(() => typeof document !== "undefined");

  const tree =
    variant === "drawer" ? (
      <div className="fixed inset-0 z-50 flex" onClick={closeOnBackdrop ? close : undefined}>
        <div ref={backdropRef} className="absolute inset-0 bg-black/30" />
        <div
          ref={panelRef}
          className={`relative ml-auto ${panelClassName} ${panelClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(close, afterEnter)}
        </div>
      </div>
    ) : (
      // The centered layer is both the scrim and the click target, so it takes
      // the backdrop ref; the card inside is what springs.
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${rootClassName}`}
        onClick={closeOnBackdrop ? close : undefined}
      >
        <div
          ref={panelRef}
          className={`${panelClassName} ${panelClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(close, afterEnter)}
        </div>
      </div>
    );

  if (portal) return canPortal ? createPortal(tree, document.body) : null;
  return tree;
}
