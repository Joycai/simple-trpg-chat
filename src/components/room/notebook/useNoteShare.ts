"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { shareNoteAction } from "@/app/actions/notebook";
import type { Note } from "./notebook-types";

/**
 * The "send a copy" picker: which note is being shared, the send in flight,
 * and its error (shown inside the picker, which stays open to retry).
 * `onSent` reports a successful send even if the picker was closed meanwhile —
 * the copies went out either way.
 */
export function useNoteShare(roomId: number, onSent: (count: number) => void) {
  const tCommon = useTranslations("common");
  const [sharing, setSharing] = useState<Note | null>(null);
  const [sendingShare, setSendingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Bumped when the picker closes, so a send that outlives its picker can't
  // annotate the next one.
  const shareSeq = useRef(0);

  const openShare = (note: Note) => {
    setShareError(null);
    setSharing(note);
  };

  /** True once sent — the picker then animates out and `closeShare` runs. */
  const handleShare = async (targetIds: number[]): Promise<boolean> => {
    if (!sharing || targetIds.length === 0) return false;
    const seq = shareSeq.current;
    setSendingShare(true);
    setShareError(null);
    try {
      const res = await shareNoteAction(roomId, sharing.id, targetIds);
      // The copies went out even if the picker was closed meanwhile, so the
      // banner stays accurate; only the picker's own state is off-limits.
      if (res.success) onSent(res.count);
      if (seq !== shareSeq.current) return false;
      // Reported inside the picker, which stays open: the selection is still
      // there to retry with, and a banner behind the modal would be unreadable.
      if (!res.success) {
        setSendingShare(false);
        setShareError(res.error);
        return false;
      }
      // Sending stays set through the exit (closeShare clears it), so the
      // button can't send a second copy while the picker fades out.
      return true;
    } catch {
      if (seq !== shareSeq.current) return false;
      setSendingShare(false);
      setShareError(tCommon("error"));
      return false;
    }
  };

  const closeShare = () => {
    shareSeq.current++;
    setSendingShare(false);
    setSharing(null);
    setShareError(null);
  };

  return { sharing, sendingShare, shareError, openShare, handleShare, closeShare };
}
