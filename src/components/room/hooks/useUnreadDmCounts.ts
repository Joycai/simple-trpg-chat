"use client";

import { useState, useCallback } from "react";
import { markDMReadAction } from "@/app/actions/messages";

/**
 * Unread DM turns per partner. Seeded from the server render; the SSE hook
 * increments it through `setUnreadCounts`, and opening a DM tab clears that
 * partner locally and on the server.
 */
export function useUnreadDmCounts(roomId: number, initial: Record<number, number>) {
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>(initial);

  const markTabRead = useCallback((partnerId: number) => {
    setUnreadCounts((prev) => ({
      ...prev,
      [partnerId]: 0,
    }));
    markDMReadAction(roomId, partnerId).catch(() => {});
  }, [roomId]);

  return { unreadCounts, setUnreadCounts, markTabRead };
}
