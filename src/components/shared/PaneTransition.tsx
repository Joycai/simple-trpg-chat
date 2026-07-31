"use client";

import { useCallback, type ReactNode } from "react";
import { animate } from "motion";

interface PaneTransitionProps {
  /**
   * Changing this remounts the pane, which is what replays the animation.
   * Pass the active tab / filter id.
   */
  paneKey: string;
  className?: string;
  children: ReactNode;
}

/**
 * Fade-and-rise for swapped content — tab panes inside drawers and modals,
 * lobby filter panes.
 *
 * The `key` lives on the inner div rather than being the caller's job: a key
 * change is what forces React to remount, and remounting is what re-fires the
 * callback ref that starts the animation. Callers that put the key on
 * <PaneTransition> itself would work too, but forgetting it silently disables
 * the transition, so it is owned here.
 *
 * Motion rather than a CSS keyframe for the same reason the overlays moved:
 * the spring is integrated in JS, so there is no CSS feature to feature-detect
 * and no browser where this silently does nothing. See useOverlayTransition.
 */
export function PaneTransition({ paneKey, className, children }: PaneTransitionProps) {
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Short and unbouncy: this fires on every tab click, so anything longer
    // reads as lag rather than polish.
    animate(el, { opacity: [0, 1], y: [6, 0] }, { type: "spring", visualDuration: 0.24, bounce: 0 });
  }, []);

  return (
    <div key={paneKey} ref={ref} className={className}>
      {children}
    </div>
  );
}
