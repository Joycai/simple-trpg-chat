"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** localStorage key — one global preference, not per room. */
const INTENSITY_KEY = "room-bg-intensity";
const DEFAULT_INTENSITY = 60;

function readStoredIntensity(): number {
  try {
    const raw = window.localStorage.getItem(INTENSITY_KEY);
    if (raw === null) return DEFAULT_INTENSITY;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return DEFAULT_INTENSITY;
    return Math.min(100, Math.max(0, n));
  } catch {
    return DEFAULT_INTENSITY;
  }
}

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
 * The floating button (bottom-right, above the chat input) opens the local
 * intensity slider: 0 = off entirely (no layers, no blur cost), stored in
 * localStorage — a per-player choice that never touches the server.
 */
export function RoomBackground({ url }: { url: string | null }) {
  const t = useTranslations("roomBackground");
  // Lazy init: SSR renders the default; the client initializer reads the
  // stored value. No hydration risk — intensity only affects layers that
  // render after `shownUrl` is set, which happens post-mount by definition.
  const [intensity, setIntensity] = useState(() =>
    typeof window === "undefined" ? DEFAULT_INTENSITY : readStoredIntensity()
  );
  // The URL most recently preloaded — lags `url` until the new image has
  // loaded, so switching backgrounds cross-fades instead of flashing a
  // half-loaded img. When `url` is null the layers derive to hidden without
  // any state write (see `effectiveUrl`).
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [showSlider, setShowSlider] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  // Close the slider popover on outside click.
  useEffect(() => {
    if (!showSlider) return;
    const onPointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowSlider(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showSlider]);

  const updateIntensity = (value: number) => {
    setIntensity(value);
    try {
      window.localStorage.setItem(INTENSITY_KEY, String(value));
    } catch {}
  };

  if (!url) return null;

  return (
    <>
      {active && (
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
      )}

      {/* Player-local intensity control — only offered while the host has a
          background set. Sits above the input bar, clear of the scroll-to-
          bottom button. */}
      <div ref={popoverRef} className="fixed bottom-24 right-4 z-30 flex flex-col items-end gap-2">
        {showSlider && (
          <div className="overlay-pop bg-surface border border-border rounded-theme shadow-lg px-4 py-3 w-56">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text">{t("intensityLabel")}</span>
              <span className="text-xs text-text-muted font-mono">
                {intensity === 0 ? t("intensityOff") : `${intensity}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={intensity}
              onChange={(e) => updateIntensity(parseInt(e.target.value, 10))}
              className="w-full accent-primary cursor-pointer"
              aria-label={t("intensityLabel")}
            />
            <p className="text-[11px] text-text-dim mt-1.5">{t("intensityHint")}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowSlider((v) => !v)}
          title={t("intensityLabel")}
          aria-label={t("intensityLabel")}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface/80 border border-border text-text-muted hover:text-text hover:border-text-muted shadow-md backdrop-blur-sm transition cursor-pointer"
        >
          {showSlider ? <X className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
        </button>
      </div>
    </>
  );
}
