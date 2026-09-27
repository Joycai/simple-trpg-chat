"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { updateNicknameAction, updateRoomMemberColorAction } from "@/app/actions/room";
import { getRandomColorForUser } from "@/lib/ui/avatar-colors";

/**
 * The member's room nickname (edited inline in the panel header) and avatar
 * colour. Failures go to the panel's error strip; a failed nickname keeps the
 * editor open, a failed colour reverts the swatch.
 */
export function useMemberProfile({
  roomId,
  userId,
  currentNickname,
  avatarColor,
  readOnly,
  onNicknameChange,
  setPanelError,
}: {
  roomId: number;
  userId: number;
  currentNickname: string;
  avatarColor: string | null | undefined;
  readOnly: boolean;
  onNicknameChange: (newNick: string) => void;
  setPanelError: Dispatch<SetStateAction<string | null>>;
}) {
  const tCommon = useTranslations("common");
  const [nickname, setNickname] = useState(currentNickname);
  const [editingNick, setEditingNick] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(avatarColor || getRandomColorForUser(userId));
  // Last colour the server accepted — a failed pick reverts the swatch to it.
  // Follows the live prop too, so a change made elsewhere is the new baseline.
  const savedColor = useRef(selectedColor);
  useEffect(() => { if (avatarColor) savedColor.current = avatarColor; }, [avatarColor]);
  // Only the latest pick may revert the swatch or report an error; the colour
  // input fires on every drag step, so older picks resolve behind newer ones.
  const colorSeq = useRef(0);
  // A failed nickname save keeps the editor open, so Enter and the following
  // blur can both fire saveNickname; this stops the second one while the
  // first is in flight.
  const savingNick = useRef(false);

  const saveNickname = async () => {
    if (savingNick.current) return;
    const next = nickname.trim();
    if (next && nickname !== currentNickname) {
      savingNick.current = true;
      setPanelError(null);
      const res = await updateNicknameAction(roomId, next)
        .catch(() => ({ success: false as const, error: tCommon("error") }));
      savingNick.current = false;
      // Stay in the editor with the typed name so the player can retry.
      if (!res.success) { setPanelError(res.error); return; }
      // Escape during the request reset the draft; show what the server kept.
      setNickname(next);
      onNicknameChange(next);
    }
    setEditingNick(false);
  };

  const handleColorChange = async (color: string) => {
    if (readOnly) return;
    const seq = ++colorSeq.current;
    setSelectedColor(color);
    setPanelError(null);
    const res = await updateRoomMemberColorAction(roomId, userId, color)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (res.success) {
      savedColor.current = color;
      return;
    }
    if (seq !== colorSeq.current) return; // a newer pick owns the swatch now
    setSelectedColor(savedColor.current);
    setPanelError(res.error);
  };

  return { nickname, setNickname, editingNick, setEditingNick, selectedColor, saveNickname, handleColorChange };
}
