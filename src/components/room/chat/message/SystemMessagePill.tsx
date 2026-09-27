"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { TimelineDivider } from "@/components/room/chat/TimelineDivider";
import { EventCard } from "@/components/room/event/EventCard";
import { parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import { parseEventCardPayload, parseEventReceiptPayload } from "@/lib/room/story-events";
import { HelpCard, SYSTEM_PILL_META, SystemPillContent } from "./SystemContent";
import { DispatchPill, ReceiptPill } from "./InventoryPills";
import type { ChatSystemKind } from "./message-types";

/** A system row in the chat, by kind: help card, inventory dispatch / receipt,
 *  event card / receipt, timeline divider, a legacy block card, or a pill. */
export const SystemMessagePill = memo(function SystemMessagePill({
  content,
  systemKind,
  diceDetail,
  isHost,
  visibleEventIds,
  onOpenEvent,
  onOpenInventory,
  onWithdrawTimeline,
  messageId,
  entered,
  pillEnterClass,
}: {
  content: string;
  systemKind?: ChatSystemKind;
  diceDetail?: string | null;
  isHost: boolean;
  visibleEventIds?: Set<number>;
  onOpenEvent?: (eventId: number) => void;
  onOpenInventory?: () => void;
  onWithdrawTimeline?: (messageId: number) => void | Promise<void>;
  messageId?: number;
  /** Whether the row arrived live (plays the entrance animation). */
  entered: boolean;
  pillEnterClass: string;
}) {
  const t = useTranslations("chat");
  // Help renders as a structured 2-column card, not a pill.
  if (systemKind === "help") {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="help">
        <HelpCard visSelfLabel={t("visSelf")} />
      </div>
    );
  }
  // Inventory dispatch: structured icon + chip pill driven by `diceDetail`.
  if (systemKind === "inventory-dispatch") {
    return <DispatchPill content={content} diceDetail={diceDetail} enter={entered} />;
  }
  // Inventory receipt: recipient-side notification with NEW/更新 badge + 查看背包 CTA.
  if (systemKind === "inventory-receipt") {
    return <ReceiptPill content={content} diceDetail={diceDetail} onOpenInventory={onOpenInventory} enter={entered} />;
  }
  // Event announcement card — locked/unlocked/retracted decided client-side.
  if (systemKind === "event-card") {
    const payload = parseEventCardPayload(diceDetail);
    if (!payload) return null;
    const unlocked = isHost || !!visibleEventIds?.has(payload.eventId);
    return (
      <div className={`flex justify-center py-2 ${pillEnterClass}`}>
        <EventCard payload={payload} unlocked={unlocked} onOpen={() => onOpenEvent?.(payload.eventId)} />
      </div>
    );
  }
  // Event receipt: a personal "you got a new event" pill opening its detail modal.
  if (systemKind === "event-receipt") {
    const r = parseEventReceiptPayload(diceDetail);
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="event-receipt">
        <button
          onClick={() => r && onOpenEvent?.(r.eventId)}
          className="system-pill-body inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 transition cursor-pointer"
        >
          <Icons.ScrollText className="w-3.5 h-3.5" />
          <span>{r ? t("eventReceipt", { title: r.title }) : content}</span>
        </button>
      </div>
    );
  }
  // Timeline divider: host date separator, with a host-only withdraw affordance.
  if (systemKind === "timeline-divider") {
    return (
      <TimelineDivider
        data={parseTimelinePayload(diceDetail)}
        fallback={content}
        isHost={isHost}
        onWithdraw={
          isHost && onWithdrawTimeline && messageId !== undefined
            ? () => onWithdrawTimeline(messageId)
            : undefined
        }
      />
    );
  }
  // Legacy multi-line messages keep the block-card fallback (no system_kind set).
  const isBlock = !systemKind && content.includes("\n");
  if (isBlock) {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-block="true">
        <div className="system-pill-body bg-surface-alt border border-border rounded-theme px-4 py-3 text-sm text-text max-w-lg text-left">
          <SystemPillContent content={content} block />
        </div>
      </div>
    );
  }
  // Kind-tagged pill (st / error / room-event / scene-marker) or the default
  // neutral pill. `help` is already handled above, so by here `systemKind` is
  // either one of the four pill kinds or null/undefined.
  const meta = systemKind ? SYSTEM_PILL_META[systemKind] : null;
  const KindIcon = meta?.icon;
  return (
    <div
      className={`system-pill flex justify-center py-2 ${pillEnterClass}`}
      data-kind={systemKind ?? undefined}
    >
      <span
        className={`system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full ${
          meta
            ? `${meta.className} not-italic`
            : "text-text-dim bg-surface-alt"
        }`}
      >
        {KindIcon && <KindIcon className="w-3.5 h-3.5 system-pill-icon" />}
        <span className="system-pill-text">
          {systemKind === "scene-marker" ? `— ${content} —` : content}
        </span>
      </span>
    </div>
  );
});
