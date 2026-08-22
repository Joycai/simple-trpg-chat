"use client";

import { useEffect, useState } from "react";
import { useRoomBgIntensity } from "@/components/room/hooks/useRoomBgIntensity";

/**
 * Full-screen ambient room background (docs/design/room-background.md).
 *
 * Layer order (all inside one fixed, pointer-transparent, z-0 wrapper that
 * paints above the room root's opaque `bg-bg` but below every positioned
 * sibling — top bar is z-20, the content row is a later positioned sibling):
 *
 *   1. the image — blurred via `--theme-bg-image-blur`, opacity from the
 *      player's local intensity slider;
 *   2. the theme scrim — `--theme-bg-scrim` / `--theme-bg-scrim-alpha`, so
 *      every theme tints the picture into its own palette.
 *
 * While a background is visibly active this component sets `data-room-bg` on
 * <body>; globals.css uses it to make the room's opaque shells (header,
 * sidebar, input bar, surfaces) translucent with a backdrop blur.
 *
 * This component only paints. The intensity slider (0 = off entirely — no
 * layers, no blur cost) lives in RoomTopBar's gear menu, alongside the other
 * personal preferences; the two share state via `useRoomBgIntensity`.
 */
export function RoomBackground({ url }: { url: string | null }) {
  const intensity = useRoomBgIntensity();
  // The URL most recently preloaded — lags `url` until the new image has
  // loaded, so a switch never flashes a half-loaded img. When `url` is null the
  // layers derive to hidden without any state write (see `effectiveUrl`).
  // `shown` is the current picture; `fading` is the one it replaced, kept
  // mounted just long enough to dissolve out over the top of it.
  //
  // Preloading alone was never a cross-fade: with a single <img> node React
  // only mutates `src`, and the `transition-opacity` on it could not fire
  // because `opacity` (intensity/100) does not change on a switch — so the
  // scene hard-cut. Two layers give the transition something to animate.
  //
  // One state object rather than two, so a switch commits both halves in a
  // single update. Splitting them meant setting one from inside the other's
  // updater, which is a side effect in a function React expects to be pure
  // (and runs twice in StrictMode).
  const [{ shown: shownUrl, fading: fadingUrl }, setLayers] = useState<{
    shown: string | null;
    fading: string | null;
  }>({ shown: null, fading: null });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      // Promote whatever is on screen to the outgoing layer as the new one
      // takes its place, so the two overlap for the length of the dissolve.
      setLayers((prev) =>
        prev.shown === url ? prev : { shown: url, fading: prev.shown },
      );
    };
    // Missing/deleted file (404) → keep whatever is shown; if it was the
    // active one the next refresh delivers url=null anyway.
    img.onerror = () => {};
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Retire the outgoing layer once it has finished fading. A timer rather than
  // `transitionend`, which does not fire when the tab is hidden mid-fade (the
  // document timeline freezes) and would strand the layer at full opacity on
  // top of the new one. Comfortably longer than the 400ms transition.
  useEffect(() => {
    if (!fadingUrl) return;
    const id = window.setTimeout(
      () => setLayers((prev) => (prev.fading ? { ...prev, fading: null } : prev)),
      500,
    );
    return () => window.clearTimeout(id);
  }, [fadingUrl]);

  // Host turned the background off → hide immediately; stale shownUrl is
  // simply ignored (and reused instantly if the same image comes back).
  const effectiveUrl = url ? shownUrl : null;
  const active = !!effectiveUrl && intensity > 0;

  // Flag <body> so globals.css can soften the room's opaque shells.
  useEffect(() => {
    if (!active) return;
    document.body.setAttribute("data-room-bg", "");
    return () => document.body.removeAttribute("data-room-bg");
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* Cross-dissolve, ordered bottom-up: the incoming picture sits underneath
          at full opacity and the outgoing one fades to 0 on top of it, revealing
          it. Only the outgoing layer animates, and because it is keyed by url it
          is the *same* DOM node that was at full opacity a moment ago — so the
          opacity change transitions without needing `@starting-style` or a
          double-rAF to escape the mount frame. Doing it the other way round (new
          layer fading in on top) would need exactly that, and would silently
          hard-cut wherever it was unsupported.

          Only the outgoing layer runs the 400ms dissolve (`data-fading`). The
          current layer keeps the original 300ms, because the one thing that
          changes *its* opacity is the intensity slider — a continuous control,
          where a longer tail would just read as lag. */}
      {/* One keyed list, not two sibling slots. React only matches by key
          *within* a list; as separate slots the outgoing image would land in a
          different child position, get torn down and remounted at opacity 0,
          and never transition at all. As a list, the node that was on screen
          keeps its identity while moving from index 0 to index 1. */}
      {[
        { url: effectiveUrl!, opacity: intensity / 100, fading: false },
        ...(fadingUrl && fadingUrl !== effectiveUrl
          ? [{ url: fadingUrl, opacity: 0, fading: true }]
          : []),
      ].map(({ url: layerUrl, opacity, fading }) => (
        /* eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed layer; next/image adds nothing here */
        <img
          key={layerUrl}
          src={layerUrl}
          alt=""
          draggable={false}
          data-fading={fading ? "true" : undefined}
          className="room-bg-layer absolute inset-0 w-full h-full object-cover scale-105"
          style={{ opacity, filter: "blur(var(--theme-bg-image-blur, 6px))" }}
        />
      ))}
      {/* Theme scrim — tints any picture into the current theme's palette. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor:
            "rgb(var(--theme-bg-scrim, var(--theme-bg)) / var(--theme-bg-scrim-alpha, 0.72))",
        }}
      />
    </div>
  );
}
