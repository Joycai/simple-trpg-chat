"use client";

import { useState, useMemo, memo } from "react";
import type { Audience } from "@/lib/messaging/audience";
import type { PlayerEntry } from "@/components/room/types";
import { CheckRequestPill } from "@/components/room/chat/message/CheckRequestPill";
import { SystemMessagePill } from "@/components/room/chat/message/SystemMessagePill";
import { MessageBubble } from "@/components/room/chat/message/MessageBubble";
import { deriveDiceView } from "@/components/room/chat/message/dice-view";
import type { ChatSystemKind } from "@/components/room/chat/message/message-types";

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request" | "image" | "sticker" | "clue";
  /** Subtype for type='system' messages. Drives the kind-specific pill / help card render. */
  systemKind?: ChatSystemKind;
  diceDetail?: string | null;
  isPrivate: boolean;
  audience?: Audience;
  createdAt: string;
  /** True when this message arrived live moments ago — plays the entrance
   *  animation. Captured once on mount, so later re-renders can't replay it. */
  enter?: boolean;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  senderId?: number;
  isHost?: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
  onCheckRequest?: (messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => void;
  /** Host proxy roll. Present only for the host; when set, the check pill shows the
   *  seal button alongside the regular viewer icon. */
  onProxyCheckRequest?: (messageId: number, onBehalfOfUserId: number) => void;
  /** Loads pending targets + each player's resolved skill value for the popover preview. */
  onLoadProxyTargets?: (messageId: number) => Promise<{
    success: boolean; error?: string; skillName?: string; isSanityCheck?: boolean;
    targets?: Array<{ userId: number; nickname: string; value: number | null }>;
  }>;
  /** Called when the receipt-pill CTA (`查看背包`) is clicked — opens the inventory drawer. */
  onOpenInventory?: () => void;
  /** Set of event ids the viewer may read — decides an event card's locked/unlocked face. */
  visibleEventIds?: Set<number>;
  /** Opens an event's detail modal (from an event card / receipt). */
  onOpenEvent?: (eventId: number) => void;
  /** Host-only: withdraw (delete) a timeline-divider message by id. */
  onWithdrawTimeline?: (messageId: number) => void | Promise<void>;
  messageId?: number;
  roomId?: number;
  hostId?: number;
  avatarColor?: string | null;
  avatar?: string | null;
  /** Full member roster — used to resolve the 投娘 (dice announcer) bot's own
   *  avatar/color when a dice card is re-skinned under its identity. */
  players?: PlayerEntry[];
}

/**
 * One chat row. Parses the message's diceDetail once and hands the row to the
 * renderer for its kind: a check request, a system row, or a regular bubble.
 */
export const ChatMessage = memo(function ChatMessage({
  nickname,
  content,
  type,
  systemKind,
  diceDetail,
  isPrivate,
  audience,
  createdAt,
  enter = false,
  isOwn,
  isBot = false,
  userId,
  senderId,
  isHost = false,
  onViewCharacter,
  onStartDM,
  onCheckRequest,
  onProxyCheckRequest,
  onLoadProxyTargets,
  onOpenInventory,
  visibleEventIds,
  onOpenEvent,
  onWithdrawTimeline,
  messageId,
  roomId,
  hostId,
  avatarColor,
  avatar,
  players,
}: ChatMessageProps) {
  // Capture the entrance flag once — the row is keyed by message id, so this
  // stays true for the animation's lifetime and never re-arms on re-render.
  const [entered] = useState(enter);
  const rowEnterClass = entered ? "animate-in fade-in slide-in-from-bottom-1" : "";
  const pillEnterClass = entered ? "animate-in fade-in" : "";
  // diceDetail parsed exactly once per unique payload — every consumer below
  // (dice meta, dice card fields, check_request pill, quip placeholder,
  // DiceResultDisplay) previously re-ran JSON.parse on the same string.
  // null covers both "no detail" and "malformed detail".
  const parsedDetail = useMemo<Record<string, unknown> | null>(() => {
    if (!diceDetail) return null;
    try { return JSON.parse(diceDetail); } catch { return null; }
  }, [diceDetail]);
  const dice = useMemo(
    () => (type === "dice" ? deriveDiceView(parsedDetail) : null),
    [type, parsedDetail],
  );

  if (type === "check_request") {
    return (
      <CheckRequestPill
        content={content}
        parsedDetail={parsedDetail}
        userId={userId}
        messageId={messageId}
        onCheckRequest={onCheckRequest}
        onProxyCheckRequest={onProxyCheckRequest}
        onLoadProxyTargets={onLoadProxyTargets}
        pillEnterClass={pillEnterClass}
      />
    );
  }

  if (type === "system") {
    return (
      <SystemMessagePill
        content={content}
        systemKind={systemKind}
        diceDetail={diceDetail}
        isHost={isHost}
        visibleEventIds={visibleEventIds}
        onOpenEvent={onOpenEvent}
        onOpenInventory={onOpenInventory}
        onWithdrawTimeline={onWithdrawTimeline}
        messageId={messageId}
        entered={entered}
        pillEnterClass={pillEnterClass}
      />
    );
  }

  const canView = !!(roomId && hostId && senderId && !isOwn && (
    senderId !== hostId && (isHost ? true : !isBot)
  ));

  // 投娘 (dice announcer): re-skin the card's avatar/name under the bot's
  // identity. The message keeps its real ownership (audience/isOwn/etc. all
  // stay keyed on the roller) — only the header visuals swap.
  const diceAnnouncer = dice?.announcer ?? null;
  const announcerMember = diceAnnouncer
    ? players?.find((p) => (p.users?.id ?? p.user?.id ?? p.user_id) === diceAnnouncer.userId)
    : undefined;

  return (
    <MessageBubble
      nickname={nickname}
      content={content}
      type={type}
      diceDetail={diceDetail}
      parsedDetail={parsedDetail}
      dice={dice}
      isPrivate={isPrivate}
      audience={audience}
      createdAt={createdAt}
      entered={entered}
      rowEnterClass={rowEnterClass}
      isOwn={isOwn}
      senderId={senderId}
      isHost={isHost}
      hostId={hostId}
      roomId={roomId}
      canView={canView}
      displayNickname={diceAnnouncer ? diceAnnouncer.nickname : nickname}
      displayAvatar={diceAnnouncer ? announcerMember?.room_members?.avatar ?? null : avatar}
      displayAvatarColor={diceAnnouncer ? announcerMember?.room_members?.avatarColor ?? null : avatarColor}
      displayIsBot={diceAnnouncer ? true : isBot}
      onViewCharacter={onViewCharacter}
      onStartDM={onStartDM}
    />
  );
});
