"use client";

import { useState, useCallback } from "react";
import { getCharacterDataAction } from "@/app/actions/character";

/**
 * Another member's character card, opened read-only from the roster, a chat
 * avatar or the members panel. `onOpen` runs as a card opens (the room closes
 * the members panel under it) and must be stable.
 */
export function usePlayerCardViewer(roomId: number, onOpen: () => void) {
  const [viewingPlayerId, setViewingPlayerId] = useState<number | null>(null);
  const [viewingPlayerNickname, setViewingPlayerNickname] = useState<string>("");
  const [viewingPlayerCharData, setViewingPlayerCharData] = useState<string | null>(null);
  const [loadingPlayerCard, setLoadingPlayerCard] = useState<boolean>(false);

  const handleViewPlayerCard = useCallback(async (targetUserId: number, targetNickname: string) => {
    onOpen();
    setViewingPlayerId(targetUserId);
    setViewingPlayerNickname(targetNickname);
    setLoadingPlayerCard(true);
    try {
      const data = await getCharacterDataAction(roomId, targetUserId);
      setViewingPlayerCharData(data ? JSON.stringify(data) : null);
    } catch (e) {
      console.error("Failed to load player character card", e);
    } finally {
      setLoadingPlayerCard(false);
    }
  }, [roomId, onOpen]);

  const closeViewingPlayer = useCallback(() => {
    setViewingPlayerId(null);
    setViewingPlayerCharData(null);
    setViewingPlayerNickname("");
  }, []);

  return {
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard,
    handleViewPlayerCard, closeViewingPlayer,
  };
}
