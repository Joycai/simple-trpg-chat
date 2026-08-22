"use client";

import { useCallback, type ReactNode } from "react";
import { animate } from "motion";
import { beginMotion, endMotion } from "@/lib/useOverlayTransition";

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
    //
    // `transform` as a whole string, not Motion's `y` shorthand — only the
    // former is in Motion's accelerated-value set and reaches WAAPI. See the
    // long note in useOverlayTransition.ts; the same reasoning applies here,
    // where the pane being faded in is often a large list.
    // `beginMotion` also stamps `data-animating`, which suppresses
    // `backdrop-filter` on the pane and everything inside it (globals.css).
    // This is the motion that fires most often — every tab click — and the
    // pane it raises is frequently a grid of frosted cards (`.inventory-card`
    // on rainglass), so it is the last place that should re-blur per frame.
    beginMotion(el);
    const ctrl = animate(
      el,
      { opacity: [0, 1], transform: ["translateY(6px)", "translateY(0px)"] },
      { type: "spring", visualDuration: 0.24, bounce: 0 },
    );
    const settle = () => {
      endMotion(el);
      // Motion commits the final keyframe inline. Clearing it restores the
      // resting `transform: none`, so the pane never becomes the containing
      // block for a `position: fixed` modal opened from inside it.
      el.style.transform = "";
    };
    ctrl.finished.then(settle).catch(settle);
  }, []);

  return (
    <div key={paneKey} ref={ref} className={className}>
      {children}
    </div>
  );
}
