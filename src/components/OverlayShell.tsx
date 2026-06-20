"use client";

import type { ReactNode } from "react";
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
  /** Receives the animated `close` so inner controls can trigger the exit. */
  children: (close: () => void) => ReactNode;
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
  children,
}: OverlayShellProps) {
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, variant);

  if (variant === "drawer") {
    return (
      <div className="fixed inset-0 z-50 flex" onClick={closeOnBackdrop ? close : undefined}>
        <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
        <div
          className={`relative ml-auto ${panelClassName} ${panelClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children(close)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass} ${rootClassName}`}
      onClick={closeOnBackdrop ? close : undefined}
    >
      <div className={`${panelClassName} ${panelClass}`} onClick={(e) => e.stopPropagation()}>
        {children(close)}
      </div>
    </div>
  );
}
