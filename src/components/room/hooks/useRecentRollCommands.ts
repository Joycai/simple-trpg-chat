"use client";

import { useSyncExternalStore } from "react";
import { pushRecent } from "@/lib/roll-command";

/** Per-room localStorage key (matches the `trpg-` prefix convention in useSidebar). */
const storageKey = (roomId: number) => `trpg-recent-rolls:${roomId}`;

const MAX_RECENT = 5;

/* Shared frozen empty snapshot — useSyncExternalStore compares snapshots by
   reference, so returning a fresh [] each call would loop forever. */
const EMPTY = Object.freeze<string[]>([]) as string[];

/* Module store rather than component state so the history survives ChatInput
   remounts (e.g. switching between public and DM tabs) without a re-read. */
const cache = new Map<number, string[]>();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function readStored(roomId: number): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(roomId));
    if (raw === null) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const items = parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT);
    return items.length > 0 ? items : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(roomId: number): string[] {
  let list = cache.get(roomId);
  if (list === undefined) {
    list = readStored(roomId);
    cache.set(roomId, list);
  }
  return list;
}

/** Record a roll command: move-to-front dedupe, capped at 5. Persist best-effort. */
export function recordRollCommand(roomId: number, cmd: string) {
  const next = pushRecent(getSnapshot(roomId), cmd, MAX_RECENT);
  cache.set(roomId, next);
  try {
    window.localStorage.setItem(storageKey(roomId), JSON.stringify(next));
  } catch {} // quota/privacy mode — keep the in-memory history only
  listeners.forEach((fn) => fn());
}

/** The user's 5 most recent roll commands in this room, most recent first. */
export function useRecentRollCommands(roomId: number): string[] {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(roomId),
    // SSR renders no history; the client re-reads on hydration.
    () => EMPTY
  );
}
