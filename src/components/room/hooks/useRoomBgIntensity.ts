"use client";

import { useSyncExternalStore } from "react";

/** localStorage key — one global preference, not per room. */
const INTENSITY_KEY = "room-bg-intensity";
const DEFAULT_INTENSITY = 60;

function readStored(): number {
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

/* The background intensity lives in a module store rather than component state
   because two unrelated subtrees need it: RoomBackground (paints the layers)
   and RoomTopBar (owns the slider in the gear menu). Lifting it to RoomClient
   would mean drilling it through RoomTopBar's already-long prop list. */
let value: number | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): number {
  if (value === null) value = readStored();
  return value;
}

// SSR renders the default; the client re-reads on hydration. Safe because
// intensity only affects layers that render after the image preloads, which
// happens post-mount by definition.
function getServerSnapshot(): number {
  return DEFAULT_INTENSITY;
}

export function setRoomBgIntensity(next: number) {
  value = Math.min(100, Math.max(0, next));
  try {
    window.localStorage.setItem(INTENSITY_KEY, String(value));
  } catch {}
  listeners.forEach((fn) => fn());
}

/** Player-local background intensity, 0–100 (0 = off). Shared across the room tree. */
export function useRoomBgIntensity(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
