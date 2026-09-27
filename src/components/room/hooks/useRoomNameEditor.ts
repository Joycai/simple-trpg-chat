"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateRoomNameAction } from "@/app/actions/room";
import { useAsyncAction } from "@/lib/ui/useAsyncAction";
import type { Room } from "@/components/room/types";

/** The host's inline room-name editor in the top bar. */
export function useRoomNameEditor(room: Room) {
  const router = useRouter();
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(room.name);

  const save = useAsyncAction((name: string) => updateRoomNameAction(room.id, name), {
    // Revert draft on failure; keep editor open so the host can retry
    onError: () => setRoomNameDraft(room.name),
    onSuccess: () => {
      setEditingRoomName(false);
      router.refresh();
    },
  });
  const savingRoomName = save.pending;

  const handleSaveRoomName = async () => {
    const trimmed = roomNameDraft.trim();
    if (!trimmed || trimmed === room.name) {
      setEditingRoomName(false);
      return;
    }
    await save.run(trimmed);
  };

  return { editingRoomName, setEditingRoomName, roomNameDraft, setRoomNameDraft, savingRoomName, handleSaveRoomName };
}
