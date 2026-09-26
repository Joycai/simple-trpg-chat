"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayTransition, type OverlayVariant } from "@/lib/ui/useOverlayTransition";
import { useEscapeToClose } from "@/lib/ui/overlay-esc";

interface OverlayShellProps {
  /** Real close handler — invoked after the exit animation finishes. */
  onClose: () => void;
  /** `modal` centers + scales; `drawer` slides in from the right edge. */
  variant?: OverlayVariant;
  /** Classes for the panel/card itself (size, surface, padding…). */
  panelClassName: string;
  /** Extra classes for the root layer (centered modal only). */
  rootClassName?: string;
  /** Stacking class for the root layer. Raise it (`z-[80]`) for a dialog that
   *  must sit above one of the inventory modals (`z-[60]`/`z-[70]`). */
  layerClassName?: string;
  /** Whether clicking the backdrop closes the overlay (default true). */
  closeOnBackdrop?: boolean;
  /** Whether Escape closes the overlay (defaults to `closeOnBackdrop`, so a
   *  non-dismissable overlay stays non-dismissable on both paths). */
  closeOnEscape?: boolean;
  /**
   * Dirty-state guard: backdrop clicks and Escape call this instead of closing,
   * and it calls `close` once the user agrees. Guarding here — before the exit
   * animation starts — matters: `onClose` only runs after the panel has
   * already animated away, too late to ask. Inner controls that close (an ×
   * or a cancel button) should route through the same guard themselves.
   */
  onDismiss?: (close: () => void) => void;
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
  layerClassName = "z-50",
  closeOnBackdrop = true,
  closeOnEscape = closeOnBackdrop,
  portal = false,
  onDismiss,
  onEntered,
  children,
}: OverlayShellProps) {
  const { close, panelRef, backdropRef, panelClass, afterEnter } = useOverlayTransition(
    onClose,
    variant,
    { closeOnEscape: closeOnEscape && !onDismiss },
  );
  const dismiss = onDismiss ? () => onDismiss(close) : close;
  // With a guard, Escape is registered here so it goes through `dismiss`.
  useEscapeToClose(dismiss, closeOnEscape && !!onDismiss);

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
      <div className={`fixed inset-0 ${layerClassName} flex`} onClick={closeOnBackdrop ? dismiss : undefined}>
        <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
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
        className={`fixed inset-0 ${layerClassName} flex items-center justify-center bg-scrim/40 ${rootClassName}`}
        onClick={closeOnBackdrop ? dismiss : undefined}
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
