"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { executeCommandAction } from "@/app/actions/messages";
import { respondToCheckRequestAction, getProxyCheckTargetsAction } from "@/app/actions/checks";
import type { CheckMode, PendingSkillCheck } from "@/components/room/types";
import { tabId } from "@/lib/ui/tab-id";

/**
 * Skill checks in the room: the top-bar check dialog/menu state, answering a
 * host's check request (with the 加骰 prompt for rules that ask for it and the
 * set-the-skill-first prompt when the stat is missing), and the host's proxy
 * rolls. Failures surface as local error rows through `pushLocalError`;
 * `refreshSelfSheet` runs after a roll that may have changed the viewer's sheet.
 */
export function useCheckFlow({
  roomId,
  userId,
  pushLocalError,
  refreshSelfSheet,
}: {
  roomId: number;
  userId: number;
  pushLocalError: (content: string, channelUserId?: number | null) => void;
  refreshSelfSheet: () => void;
}) {
  const tra = useTranslations("roomActions");
  const tCommon = useTranslations("common");
  const [checkMode, setCheckMode] = useState<CheckMode | null>(null);
  const [showCheckMenu, setShowCheckMenu] = useState(false);
  const [pendingSkillCheck, setPendingSkillCheck] = useState<PendingSkillCheck | null>(null);
  const [pendingBonusDice, setPendingBonusDice] = useState<{ messageId: number } | null>(null);

  // Roll the check on the server. Returns { needsSkill } when the stat isn't set yet
  // (so the caller can open the prompt); otherwise surfaces any error inline.
  const respondCheck = useCallback(async (messageId: number, onBehalfOfUserId?: number, bonusDice?: number): Promise<{ needsSkill?: boolean }> => {
    // Only a self roll refreshes this tab afterwards (below), so only it skips
    // its own `character_updated`; a proxy roll lets the event reload the
    // host's overview and views of that player.
    const result = await respondToCheckRequestAction(
      roomId, messageId,
      onBehalfOfUserId !== undefined ? { onBehalfOfUserId, bonusDice } : { bonusDice, origin: tabId() }
    );
    if (result.needsSkill) return { needsSkill: true };
    if (!result.success && result.error) {
      pushLocalError(tra("commandError", { error: result.error }));
    } else if (result.success && !onBehalfOfUserId) {
      // A sanity check deducts 理智值 — refresh the open sheet/skill panels.
      // (Proxy rolls deduct the proxied player's sanity, not the host's — no self refresh.)
      refreshSelfSheet();
    }
    return {};
  }, [roomId, tra, refreshSelfSheet, pushLocalError]);

  const handleCheckRequest = useCallback((messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => {
    // Rule-specialized request (狩魂者): ask the player for their 加骰 count
    // first; the roll fires from the prompt's confirm.
    if (opts?.bonusDicePrompt) {
      setPendingBonusDice({ messageId });
      return;
    }
    // Let the server roll the check. If the stat isn't set, it reports needsSkill and we
    // open a themed in-page prompt. The server (lookupCheckTarget) is the source of truth,
    // so COC attributes/resources already on the character sheet won't trigger the prompt.
    respondCheck(messageId).then(r => {
      if (r.needsSkill) setPendingSkillCheck({ messageId, skillName });
    });
  }, [respondCheck]);

  // Player confirmed their 加骰 count for a rule-specialized check request.
  const handleConfirmBonusDice = useCallback((bonusDice: number) => {
    if (!pendingBonusDice) return;
    const { messageId } = pendingBonusDice;
    setPendingBonusDice(null);
    respondCheck(messageId, undefined, bonusDice);
  }, [pendingBonusDice, respondCheck]);

  /** Host proxy: roll on behalf of an absent target. Skill prompt never triggers
   *  (the host can't set another player's skill — the server returns a plain error). */
  const handleProxyCheckRequest = useCallback((messageId: number, onBehalfOfUserId: number) => {
    respondCheck(messageId, onBehalfOfUserId);
  }, [respondCheck]);

  /** Fetch pending targets + each player's resolved skill value for the popover preview. */
  const loadProxyTargets = useCallback((messageId: number) => {
    return getProxyCheckTargetsAction(roomId, messageId);
  }, [roomId]);

  // Player confirmed a skill value in the prompt: set it via the .st command (which applies
  // the COC 7th rule adaptation — attributes/resources go to the character sheet, not skills),
  // then roll the check.
  const handleConfirmSkillSet = useCallback(async (value: number) => {
    if (!pendingSkillCheck) return;
    const { messageId, skillName } = pendingSkillCheck;
    setPendingSkillCheck(null);
    const res = await executeCommandAction(roomId, userId, `.st ${skillName}${value}`, undefined, undefined, tabId())
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    // Without the stat the check would only ask for it again — stop here.
    if (!res.success) {
      pushLocalError(tra("commandError", { error: res.error || tCommon("error") }));
      return;
    }
    await respondCheck(messageId);
  }, [pendingSkillCheck, roomId, userId, respondCheck, pushLocalError, tra, tCommon]);

  return {
    checkMode, setCheckMode, showCheckMenu, setShowCheckMenu,
    pendingSkillCheck, setPendingSkillCheck, pendingBonusDice, setPendingBonusDice,
    handleCheckRequest, handleConfirmBonusDice, handleProxyCheckRequest, loadProxyTargets, handleConfirmSkillSet,
  };
}
