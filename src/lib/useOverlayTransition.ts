"use client";

import { useCallback, useRef } from "react";
import { animate } from "motion";
import { useEscapeToClose } from "@/lib/overlay-esc";

export type OverlayVariant = "drawer" | "modal" | "popover";

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
  // Anchored popovers (dice panel, pickers) rise off the control that opened
  // them. Quick and barely bouncy: these sit inches from the cursor and open on
  // a click the user just made, so anything slower reads as lag.
  popover: { type: "spring", visualDuration: 0.22, bounce: 0.12 },
} as const;

/** Backdrops are opacity-only: a spring's overshoot would clip at 0–1 anyway. */
const BACKDROP_ENTER = { duration: 0.3, ease: [0.33, 1, 0.68, 1] } as const;

/**
 * Exits are deliberately NOT springy — a dismissed panel should leave
 * decisively, so it accelerates away (easeInCubic) instead of settling.
 */
const EXIT = { duration: 0.22, ease: [0.32, 0, 0.67, 0] } as const;

/**
 * Keyframes are whole `transform` strings, never Motion's `x` / `y` / `scale`
 * shorthands. That distinction decides whether these animations run on the
 * compositor or on the main thread.
 *
 * Motion only hands a value to WAAPI when its name is in its `acceleratedValues`
 * set — `opacity`, `transform`, `filter`, `clipPath`, `backgroundColor`. `x` is
 * NOT in it: it is an independent MotionValue that Motion composes into a
 * transform string itself, writing inline style every frame from a rAF loop.
 * Firefox can only run CSS/WAAPI animations off the main thread, so the `x`
 * form meant a full-height drawer re-rasterising on the main thread each frame,
 * in lockstep with whatever React was doing — a mount-time fetch resolving
 * mid-slide was enough to drop frames. Composing the transform ourselves costs
 * nothing (nothing else animates these panels' transforms) and hands the whole
 * slide to the compositor.
 *
 * Springs survive the trip: Motion expands the generator into pregenerated
 * keyframes plus a `linear()` easing before handing it to WAAPI. Where
 * `linear()` is missing, that path degrades to ~300ms easeOut — a plainer
 * curve, but still an animation, unlike the old CSS approach which degraded to
 * no animation at all.
 */
const ENTER_KEYFRAMES = {
  drawer: { transform: ["translateX(100%)", "translateX(0%)"] },
  modal: { transform: ["scale(0.92)", "scale(1)"], opacity: [0, 1] },
  popover: {
    transform: ["translateY(10px) scale(0.97)", "translateY(0px) scale(1)"],
    opacity: [0, 1],
  },
};

const EXIT_KEYFRAMES = {
  drawer: { transform: "translateX(100%)" },
  modal: { transform: "scale(0.97)", opacity: 0 },
  popover: { transform: "translateY(6px) scale(0.98)", opacity: 0 },
};

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
 * Marks the panel as in-flight for the duration of a transition.
 *
 * `will-change` asks for the layer up front; `data-animating` is the CSS hook
 * that suppresses `backdrop-filter` while the panel moves (globals.css). A
 * moving backdrop-filter has to re-sample and re-blur everything behind it on
 * every frame, which no amount of compositing fixes — the only cure is not
 * having one mid-flight.
 */
function beginMotion(el: HTMLElement, variant: OverlayVariant) {
  el.style.willChange = variant === "drawer" ? "transform" : "transform, opacity";
  el.setAttribute("data-animating", "");
}

function endMotion(el: HTMLElement) {
  el.style.willChange = "";
  el.removeAttribute("data-animating");
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
 *
 * Heavy work a panel kicks off on mount (data fetches, and above all the state
 * commits and route revalidations they trigger) should be routed through
 * `afterEnter` so the render lands after the motion instead of inside it.
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
  // Work parked by `afterEnter` while the panel is still moving.
  const pendingRef = useRef<(() => void)[]>([]);

  const flushPending = useCallback(() => {
    const queued = pendingRef.current;
    pendingRef.current = [];
    for (const fn of queued) fn();
  }, []);

  const markEntered = useCallback(() => {
    enteredRef.current = true;
    flushPending();
  }, [flushPending]);

  /**
   * Runs `fn` once the panel has settled — immediately if it already has, or if
   * there is no animation to wait for (reduced motion, cancelled enter). Every
   * path that ends the enter calls `markEntered`, so queued work can never be
   * stranded.
   */
  const afterEnter = useCallback(
    (fn: () => void) => {
      if (enteredRef.current || closedRef.current) {
        fn();
        return;
      }
      pendingRef.current.push(fn);
    },
    [],
  );

  // Callback refs, not useLayoutEffect: React attaches them during commit,
  // before paint, so the "from" keyframe lands before the browser draws —
  // and unlike an effect they fire again if the element is replaced.
  const panelRef = useCallback(
    (el: HTMLDivElement | null) => {
      panelEl.current = el;
      if (!el || enteredRef.current || closedRef.current) return;
      if (prefersReducedMotion()) {
        markEntered();
        return;
      }
      beginMotion(el, variant);
      const ctrl = animate(el, ENTER_KEYFRAMES[variant], ENTER_SPRING[variant]);
      ctrl.finished
        .then(() => {
          endMotion(el);
          // Motion commits the final keyframe as inline style. Dropping it
          // restores the resting `transform: none` the old `x`-based animation
          // ended on, which matters beyond tidiness: a non-none transform makes
          // the panel the containing block for `position: fixed` descendants,
          // which would trap any nested modal inside the drawer.
          el.style.transform = "";
          markEntered();
        })
        // Cancelled mid-flight (the node was swapped out). Deliberately not
        // `markEntered`: the replacement node must still animate. But queued
        // work has to run — nothing else is coming to release it.
        .catch(() => {
          endMotion(el);
          flushPending();
        });
    },
    [variant, markEntered, flushPending],
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
    beginMotion(panel, variant);
    const exit = animate(panel, EXIT_KEYFRAMES[variant], EXIT);

    // `.finished` rejects if the animation is cancelled by an unmount; the
    // parent has already dropped us in that case, so swallow it. The panel's
    // transform is deliberately left in place — it holds the off-screen
    // position until the parent unmounts.
    exit.finished
      .then(() => {
        // The transform is deliberately NOT cleared — it holds the panel
        // off-screen for the frame between here and the parent's unmount.
        endMotion(panel);
        onClose();
      })
      .catch(() => {});
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

  return { close, panelRef, backdropRef, panelClass, afterEnter };
}
