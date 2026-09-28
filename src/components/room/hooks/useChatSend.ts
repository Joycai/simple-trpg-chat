"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sendMessageAction, rollDiceAction, executeCommandAction, withdrawTimelineDividerAction } from "@/app/actions/messages";
import type { Message } from "@/components/room/types";
import { tabId } from "@/lib/ui/tab-id";

// Decrementing counter for local-only ephemeral message IDs (never persisted to DB).
// Negative IDs guarantee no collision with real DB auto-increment IDs.
let localEphemeralId = -1;

/**
 * Everything the chat input sends: messages, dice, chat commands, and the
 * host's divider withdrawal. Failures land in the feed as self-only error rows
 * (`pushLocalError`); a command that edits the viewer's sheet refreshes it
 * (`refreshSelfSheet`). Both are returned for the check flow to reuse.
 */
export function useChatSend({
  roomId,
  userId,
  activeTab,
  seenIdsRef,
  liveEnterRef,
  setMessages,
  setSkillRefreshKey,
}: {
  roomId: number;
  userId: number;
  /** The open tab: "public", or the DM partner's user id. */
  activeTab: "public" | number;
  seenIdsRef: MutableRefObject<Set<string>>;
  liveEnterRef: MutableRefObject<Map<string, number>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setSkillRefreshKey: Dispatch<SetStateAction<number>>;
}) {
  const tra = useTranslations("roomActions");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Re-fetch the current user's sheet so an open 角色卡 reflects command-driven
  // changes (.st / .sc) without a full page reload. router.refresh() updates the
  // characterData prop; the key bump reloads the CharacterPanel's 技能 tab.
  const refreshSelfSheet = useCallback(() => {
    router.refresh();
    setSkillRefreshKey(k => k + 1);
  }, [router, setSkillRefreshKey]);

  // A self-only SYSTEM error row that never reached the server — how command,
  // send and withdraw failures surface in the feed. Gone on reload.
  const pushLocalError = useCallback((content: string, channelUserId: number | null = null) => {
    const errorMsg = {
      id: localEphemeralId--, roomId: roomId, userId, nickname: "SYSTEM",
      content,
      type: "system" as const, audience: "self" as const,
      systemKind: "error" as const,
      targetUserId: null, channelUserId,
      isPrivate: true, diceDetail: null,
      createdAt: new Date().toISOString()
    };
    seenIdsRef.current.add(String(errorMsg.id));
    liveEnterRef.current.set(String(errorMsg.id), Date.now());
    setMessages(prev => [...prev, errorMsg]);
  }, [roomId, userId, seenIdsRef, liveEnterRef, setMessages]);

  const handleSendMessage = useCallback(async (
    content: string,
    type: "text" | "dice" | "image" | "sticker",
    diceDetail?: string,
    isPrivate?: boolean,
    targetUserId?: number
  ) => {
    // The channel we're posting in: public, or a DM with this partner.
    const channelPartner = activeTab !== "public" ? activeTab : undefined;

    // Text/image inherit the channel's privacy (a DM tab → a `dm` whisper). The
    // dice panel's 🔒 "secret" toggle is handled separately below (hidden roll),
    // so it is NOT folded into the channel here.
    let finalIsPrivate = isPrivate;
    let finalTargetId = targetUserId;
    if (channelPartner !== undefined) {
      finalIsPrivate = true;
      finalTargetId = channelPartner;
    }

    // .st / .sc mutate the character sheet — refresh the open panels afterwards (both
    // command prefixes, and whether intercepted on the client or inside sendMessageAction).
    // No \b after st/sc: the compact form (.stsan60) has no boundary, and no other
    // command token starts with "st"/"sc", so a bare prefix match is correct.
    const isSheetMutationCmd = type === "text" && /^[.。]\s*(st|sc)/i.test(content.trim());
    // That refresh covers the write, so this tab skips its own character_updated.
    const origin = isSheetMutationCmd ? tabId() : undefined;

    // Commands are also intercepted server-side in sendMessageAction; both guards must stay in sync.
    // Pass the channel context so command feedback stays inside a DM instead of broadcasting publicly.
    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(roomId, userId, content, finalIsPrivate, finalTargetId, origin);
        if (!result.success && result.error) {
          pushLocalError(tra("commandError", { error: result.error }), channelPartner ?? null);
        }
      } catch (e) {
        console.error(e);
        pushLocalError(tra("sendFailed", { error: tCommon("error") }), channelPartner ?? null);
      }
      if (isSheetMutationCmd) refreshSelfSheet();
      return;
    }
    try {
      let res: { success: true } | { success: false; error: string };
      if (type === "dice") {
        // Dice always go through rollDiceAction so the server is the source of
        // truth for the result. Skip silently if the caller didn't include the
        // detail we need — that's a programming bug, not a chat message.
        if (!diceDetail) return;
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        // `isPrivate` here is the dice panel's 🔒 secret toggle → a hidden (self-only)
        // roll. `channelPartner` decides where it lands (current DM, or public).
        const hidden = !!isPrivate;
        res = await rollDiceAction(roomId, faces, detail.count, hidden, channelPartner);
      } else {
        res = await sendMessageAction(roomId, content, type, finalIsPrivate, finalTargetId, origin);
      }
      if (!res.success) {
        pushLocalError(tra("sendFailed", { error: res.error }), channelPartner ?? null);
        return;
      }
      if (isSheetMutationCmd) refreshSelfSheet();
    } catch (e) {
      console.error(e);
      pushLocalError(tra("sendFailed", { error: tCommon("error") }), channelPartner ?? null);
    }
  }, [roomId, userId, activeTab, tra, tCommon, refreshSelfSheet, pushLocalError]);

  // Host withdraws a timeline divider. The row is removed for everyone via the
  // `message_deleted` SSE event (handled in useRoomEvents), including this client.
  const handleWithdrawTimeline = useCallback(async (messageId: number) => {
    const res = await withdrawTimelineDividerAction(roomId, messageId)
      .catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) pushLocalError(tra("withdrawFailed", { error: res.error }));
  }, [roomId, pushLocalError, tra, tCommon]);

  return { pushLocalError, refreshSelfSheet, handleSendMessage, handleWithdrawTimeline };
}
