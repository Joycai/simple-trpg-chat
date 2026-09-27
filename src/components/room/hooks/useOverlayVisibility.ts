"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/** Every panel, dialog and top-bar dropdown the room can open, by name. */
export const ROOM_OVERLAYS = [
  "settings", "character", "inventory", "notebook", "itemManager", "events", "eventManage",
  "timeline", "botManager", "aiImport", "roomInfo", "members", "systemMenu", "aiMenu",
  "userSettings", "export", "hotkeyHelp",
] as const;
export type RoomOverlayKey = (typeof ROOM_OVERLAYS)[number];

export interface OverlayVisibility {
  /** Which overlays are open. */
  shown: Record<RoomOverlayKey, boolean>;
  /** One setter per overlay, stable for the component's lifetime — the same
   *  contract as a `useState` setter, value or updater. */
  setters: Record<RoomOverlayKey, Dispatch<SetStateAction<boolean>>>;
}

export const ALL_CLOSED = Object.fromEntries(ROOM_OVERLAYS.map((k) => [k, false])) as Record<RoomOverlayKey, boolean>;

/** One overlay's update: the same map back when the value doesn't change, so
 *  React bails out exactly as it would for a separate `useState`. */
export function setOverlay(
  prev: Record<RoomOverlayKey, boolean>,
  key: RoomOverlayKey,
  value: SetStateAction<boolean>,
): Record<RoomOverlayKey, boolean> {
  const next = typeof value === "function" ? value(prev[key]) : value;
  return next === prev[key] ? prev : { ...prev, [key]: next };
}

/**
 * Open/closed state for the room's overlays, held as one map instead of a
 * `useState` pair each. Setting an overlay to the value it already has keeps
 * the same map, so — as with separate states — nothing re-renders.
 */
export function useOverlayVisibility(): OverlayVisibility {
  const [shown, setShown] = useState(ALL_CLOSED);
  const [setters] = useState(() =>
    Object.fromEntries(
      ROOM_OVERLAYS.map((key) => [
        key,
        (value: SetStateAction<boolean>) => setShown((prev) => setOverlay(prev, key, value)),
      ]),
    ) as OverlayVisibility["setters"],
  );
  return { shown, setters };
}
