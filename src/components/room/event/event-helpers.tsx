"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { MentionChip } from "@/components/room/notebook/notebook-helpers";
import { getMyInventory } from "@/app/actions/inventory";
import type { NotebookLinkEntity } from "@/lib/notebook";
import { composeTimelineLabel, parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import type { EventStatus } from "@/db/schema";

/**
 * MarkdownRenderer emits block elements (headings, paragraphs, lists, quotes,
 * spacers). For a clamped one-liner/teaser we flatten those to inline so the
 * `line-clamp` counts wrapped lines and the ellipsis lands — while leaving the
 * genuinely-inline runs (bold / italic / links / mention chips) untouched, so
 * markdown *styling* still shows. Block bullets become an inline "· " marker.
 */
const INLINE_MD = [
  "[&_p]:!inline [&_div]:!inline [&_ul]:!inline [&_ol]:!inline [&_li]:!inline",
  "[&_blockquote]:!inline [&_pre]:!inline [&_table]:!inline [&_thead]:!inline [&_tbody]:!inline [&_tr]:!inline [&_th]:!inline [&_td]:!inline",
  "[&_p]:!my-0 [&_p]:!ml-0 [&_p]:!mr-1.5 [&_div]:!m-0 [&_ul]:!m-0 [&_ul]:!p-0 [&_ol]:!m-0 [&_ol]:!p-0",
  "[&_blockquote]:!m-0 [&_blockquote]:!p-0 [&_blockquote]:!border-0 [&_blockquote]:!bg-transparent",
  "[&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!border-0 [&_pre]:!bg-transparent",
  "[&_.md-heading]:!text-sm [&_.md-list]:!list-none",
  "[&_li]:!mr-2 [&_li]:before:content-['·'] [&_li]:before:mr-1 [&_li]:before:text-text-dim",
  "[&_img]:!hidden",
].join(" ");

const CLAMP: Record<1 | 2 | 3, string> = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3" };

/**
 * Markdown-styled body preview clamped to `lines` visual lines with an ellipsis.
 * `entities` (optional) resolves `@mentions` to chips; omit for a lighter,
 * literal-text preview. Renders nothing for empty content.
 */
export function EventBodyPreview({
  content,
  lines,
  entities,
  className = "",
}: {
  content: string;
  lines: 1 | 2 | 3;
  entities?: NotebookLinkEntity[];
  className?: string;
}) {
  if (!content.trim()) return null;
  return (
    <div className={`${CLAMP[lines]} text-sm text-text-muted leading-6 break-words ${INLINE_MD} ${className}`}>
      <MarkdownRenderer
        content={content}
        mentions={entities ? { entities, render: (entity, key) => <MentionChip key={key} entity={entity} className="mx-0.5" /> } : undefined}
      />
    </div>
  );
}

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
  unpublished: { labelKey: "statusUnpublished", Icon: Icons.Flag, text: "text-text-dim", border: "border-border", dot: "bg-text-dim" },
  partial: { labelKey: "statusPartial", Icon: Icons.Eye, text: "text-warning", border: "border-warning/50", dot: "bg-warning" },
  full: { labelKey: "statusFull", Icon: Icons.Users, text: "text-success", border: "border-success/50", dot: "bg-success" },
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
