"use client";

import { useState } from "react";

/**
 * Live member list: seeded from the server, patched in place by
 * `member_updated` SSE deltas (nickname / color / avatar changes) so those
 * no longer cost every client a full router.refresh(). A real server
 * re-render (navigation, or the remaining refresh events) re-seeds it via
 * the render-time reset below (React's derive-state-from-props pattern —
 * re-renders immediately without committing the stale tree).
 */
export function useLivePlayers<T>(initialPlayers: T) {
  const [players, setPlayers] = useState(initialPlayers);
  const [seededPlayers, setSeededPlayers] = useState(initialPlayers);
  if (seededPlayers !== initialPlayers) {
    setSeededPlayers(initialPlayers);
    setPlayers(initialPlayers);
  }
  return { players, setPlayers };
}
