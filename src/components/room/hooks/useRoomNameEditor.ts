"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRoomNameAction } from "@/app/actions/room";
import type { Room } from "@/components/room/types";

/** The host's inline room-name editor in the top bar. */
export function useRoomNameEditor(room: Room) {
  const router = useRouter();
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.name);
  const [savingRoomName, setSavingRoomName] = useState(false);

  const handleSaveRoomName = async () => {
    const trimmed = roomNameDraft.trim();
    if (!trimmed || trimmed === room.name) {
      setEditingRoomName(false);
      return;
    }
    setSavingRoomName(true);
    const res = await updateRoomNameAction(room.id, trimmed)
      .catch(() => ({ success: false as const }));
    setSavingRoomName(false);
    if (!res.success) {
      // Revert draft on failure; keep editor open so the host can retry
      setRoomNameDraft(room.name);
      return;
    }
    setEditingRoomName(false);
    router.refresh();
  };

  return { editingRoomName, setEditingRoomName, roomNameDraft, setRoomNameDraft, savingRoomName, handleSaveRoomName };
}
