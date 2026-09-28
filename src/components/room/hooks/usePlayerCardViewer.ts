"use client";

import { useState, useCallback } from "react";
import { getCharacterDataAction } from "@/app/actions/character";

/**
 * Another member's character card, opened from the roster, a chat avatar or
 * the members panel. `onOpen` runs as a card opens (the room closes the
 * members panel under it) and must be stable. `reloadViewedCard` re-reads the
 * open card when someone else changes it; `viewedCardRefreshKey` tells the
 * panel's skills tab to reload too.
 */
export function usePlayerCardViewer(roomId: number, onOpen: () => void) {
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  const [viewingPlayerNickname, setViewingPlayerNickname] = useState<string>("");
  const [viewingPlayerCharData, setViewingPlayerCharData] = useState<string | null>(null);
  const [loadingPlayerCard, setLoadingPlayerCard] = useState<boolean>(false);
  const [viewedCardRefreshKey, setViewedCardRefreshKey] = useState(0);

  const load = useCallback(async (targetUserId: number) => {
    const data = await getCharacterDataAction(roomId, targetUserId);
    setViewingPlayerCharData(data ? JSON.stringify(data) : null);
  }, [roomId]);

  const handleViewPlayerCard = useCallback(async (targetUserId: number, targetNickname: string) => {
    onOpen();
    setViewingPlayerId(targetUserId);
    setViewingPlayerNickname(targetNickname);
    setLoadingPlayerCard(true);
    try {
      await load(targetUserId);
    } catch (e) {
      console.error("Failed to load player character card", e);
    } finally {
      setLoadingPlayerCard(false);
    }
  }, [onOpen, load]);

  // Quiet re-read (no loading state), so the open panel keeps its draft and tab.
  const reloadViewedCard = useCallback(() => {
    if (viewingPlayerId === null) return;
    load(viewingPlayerId).catch(() => {});
    setViewedCardRefreshKey((k) => k + 1);
  }, [viewingPlayerId, load]);

  const closeViewingPlayer = useCallback(() => {
    setViewingPlayerId(null);
    setViewingPlayerCharData(null);
    setViewingPlayerNickname("");
  }, []);

  return {
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard,
    viewedCardRefreshKey, handleViewPlayerCard, closeViewingPlayer, reloadViewedCard,
  };
}
