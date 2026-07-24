"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { getMyInventory } from "@/app/actions/inventory";
import type { NotebookLinkEntity } from "@/lib/notebook";
import { composeTimelineLabel, parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import type { EventStatus } from "@/db/schema";

/** A room member the host can grant an event to. */
export interface EventPlayer {
  id: number;
  nickname: string;
  isBot: boolean;
  isOnline?: boolean;
  avatarColor?: string | null;
}

type IconComponent = (typeof Icons)[keyof typeof Icons];

/** Visual + label mapping for the three publish states (semantic tokens). */
export const STATUS_META: Record<
  EventStatus,
  { labelKey: string; Icon: IconComponent; text: string; border: string; dot: string }
> = {
  unpublished: { labelKey: "statusUnpublished", Icon: Icons.ScrollText, text: "text-text-dim", border: "border-border", dot: "bg-text-dim" },
  partial: { labelKey: "statusPartial", Icon: Icons.Eye, text: "text-warning", border: "border-warning/50", dot: "bg-warning" },
  full: { labelKey: "statusFull", Icon: Icons.Users, text: "text-primary", border: "border-primary/50", dot: "bg-primary" },
};

/** Small pill showing an event's publish status. */
export function StatusBadge({ status, knowerCount }: { status: EventStatus; knowerCount?: number }) {
  const t = useTranslations("event");
  const m = STATUS_META[status];
  const label = status === "partial" && knowerCount != null ? t("statusPartialN", { count: knowerCount }) : t(m.labelKey);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-0.5 rounded-full border ${m.text} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${status === "full" ? "shadow-[var(--theme-glow)]" : ""}`} />
      {label}
    </span>
  );
}

/** Localized in-game time label from a stored timeline payload (null → nothing). */
export function EventTimeLabel({ payload, className = "" }: { payload: string | null; className?: string }) {
  const t = useTranslations("timeline");
  const locale = useLocale();
  const data = parseTimelinePayload(payload);
  if (!data) return null;
  const label = composeTimelineLabel(data, t, locale);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 font-theme-mono ${className}`}>
      <Icons.Clock className="w-3.5 h-3.5 shrink-0" />
      {label}
    </span>
  );
}

/**
 * The viewer's backpack entries as linkable mention entities (dedupe by item id),
 * so event descriptions resolve `@Title` against what the viewer actually holds.
 * Re-fetches on `refreshKey`.
 */
export function useBackpackEntities(roomId: number, refreshKey?: number): NotebookLinkEntity[] {
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  useEffect(() => {
    let alive = true;
    getMyInventory(roomId)
      .then((rows) => {
        if (!alive) return;
        const seen = new Set<number>();
        const out: NotebookLinkEntity[] = [];
        for (const dist of rows as Array<{ item?: { id: number; type: string; title: string } | null }>) {
          const item = dist.item;
          if (item && !seen.has(item.id)) {
            seen.add(item.id);
            out.push({ id: item.id, type: item.type, title: item.title });
          }
        }
        setEntities(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId, refreshKey]);
  return entities;
}
