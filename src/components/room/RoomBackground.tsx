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
  // loaded, so switching backgrounds cross-fades instead of flashing a
  // half-loaded img. When `url` is null the layers derive to hidden without
  // any state write (see `effectiveUrl`).
  const [shownUrl, setShownUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setShownUrl(url);
    };
    // Missing/deleted file (404) → keep whatever is shown; if it was the
    // active one the next refresh delivers url=null anyway.
    img.onerror = () => {};
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

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
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed layer; next/image adds nothing here */}
      <img
        src={effectiveUrl!}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 scale-105"
        style={{
          opacity: intensity / 100,
          filter: "blur(var(--theme-bg-image-blur, 6px))",
        }}
      />
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
