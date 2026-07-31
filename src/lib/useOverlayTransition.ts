"use client";

import { useCallback, useRef } from "react";
import { animate } from "motion";
import { useEscapeToClose } from "@/lib/overlay-esc";

export type OverlayVariant = "drawer" | "modal";

/**
 * Motion springs, not CSS curves.
 *
 * These used to be `linear()` easings sampled from a spring equation in
 * globals.css. That produced the right motion but had a hard failure mode:
 * `linear()` is unsupported in ~13% of browsers, and because the curve reached
 * the rule through a custom property, an unsupporting browser invalidated the
 * whole `animation` declaration at computed-value time — falling back to
 * `animation-name: none`, i.e. no animation at all rather than a simpler curve.
 *
 * Motion integrates the spring in JS and writes plain transforms, so the motion
 * is identical everywhere React runs, with no CSS feature detection.
 *
 * `visualDuration` is the time to visually reach the target (the settle tail
 * runs past it); `bounce` is 1 - dampingRatio.
 */
const ENTER_SPRING = {
  // Drawers slide a long distance — overshoot would rubber-band the layout.
  drawer: { type: "spring", visualDuration: 0.42, bounce: 0.05 },
  // Centered modals get a visible tip past their resting size before settling.
  modal: { type: "spring", visualDuration: 0.3, bounce: 0.3 },
} as const;

/** Backdrops are opacity-only: a spring's overshoot would clip at 0–1 anyway. */
const BACKDROP_ENTER = { duration: 0.3, ease: [0.33, 1, 0.68, 1] } as const;

/**
 * Exits are deliberately NOT springy — a dismissed panel should leave
 * decisively, so it accelerates away (easeInCubic) instead of settling.
 */
const EXIT = { duration: 0.22, ease: [0.32, 0, 0.67, 0] } as const;

export interface OverlayTransitionOptions {
  /**
   * Escape closes the topmost overlay by default (same animated `close` the
   * backdrop uses). Set false for overlays that must not dismiss this way —
   * forced gates, or panels with their own dirty-state guard, which should
   * register that guard via `useEscapeToClose` themselves.
   */
  closeOnEscape?: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Drives enter/exit transitions for overlays whose mount is owned by a parent
 * boolean (the common `{showX && <Panel onClose={...} />}` pattern).
 *
 * Attach `panelRef` to the panel and `backdropRef` to the scrim. The enter
 * animation runs before the first paint; `close()` plays the exit and only then
 * calls the real `onClose`, so the parent unmounts after — not before — the
 * motion finishes.
 *
 * Call `close()` everywhere the panel would have called `onClose` (close
 * button, backdrop click, cancel, post-save).
 */
export function useOverlayTransition(
  onClose: () => void,
  variant: OverlayVariant = "modal",
  { closeOnEscape = true }: OverlayTransitionOptions = {},
) {
  const panelEl = useRef<HTMLDivElement | null>(null);
  const backdropEl = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef(false);
  // Set once the enter animation has run to completion. Until then, a panel
  // that swaps its DOM node mid-flight (CharacterPanel renders a different tree
  // for its loading state) replays the enter on the new node — otherwise the
  // replacement would appear already at rest and the motion would visibly jump.
  // After it completes, a swap is just a content change and must not re-animate.
  const enteredRef = useRef(false);
  // Callback refs, not useLayoutEffect: React attaches them during commit,
  // before paint, so the "from" keyframe lands before the browser draws —
  // and unlike an effect they fire again if the element is replaced.
  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      panelEl.current = el;
      if (!el || enteredRef.current || closedRef.current || prefersReducedMotion()) return;
      const ctrl =
        variant === "drawer"
          ? animate(el, { x: ["100%", "0%"] }, ENTER_SPRING.drawer)
          : animate(el, { scale: [0.92, 1], opacity: [0, 1] }, ENTER_SPRING.modal);
      ctrl.finished
        .then(() => {
          enteredRef.current = true;
        })
        .catch(() => {});
    },
    [variant],
  );

  const backdropRef = useCallback((el: HTMLDivElement | null) => {
    backdropEl.current = el;
    if (!el || enteredRef.current || closedRef.current || prefersReducedMotion()) return;
    animate(el, { opacity: [0, 1] }, BACKDROP_ENTER);
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;

    const panel = panelEl.current;
    const backdrop = backdropEl.current;

    if (prefersReducedMotion() || !panel) {
      onClose();
      return;
    }

    if (backdrop) animate(backdrop, { opacity: 0 }, EXIT);
    const exit =
      variant === "drawer"
        ? animate(panel, { x: "100%" }, EXIT)
        : animate(panel, { scale: 0.97, opacity: 0 }, EXIT);

    // `.finished` rejects if the animation is cancelled by an unmount; the
    // parent has already dropped us in that case, so swallow it.
    exit.finished.then(() => onClose()).catch(() => {});
  }, [variant, onClose]);

  useEscapeToClose(close, closeOnEscape);

  /**
   * Styling hook only — this no longer drives any animation (Motion does).
   * It still has to be on the panel because themes select on it for visual
   * chrome, not motion: rainglass frosts `.overlay-modal` / `.overlay-drawer`,
   * shrine overrides their corner radii. Dropping it silently flattens those
   * themes' overlays, so keep it on whatever element carries `panelRef`.
   */
  const panelClass = variant === "drawer" ? "overlay-drawer" : "overlay-modal";

  return { close, panelRef, backdropRef, panelClass };
}
