"use client";

import { Icons } from "@/components/shared/icons";
import type { NotebookCategory, NotebookLinkEntity } from "@/lib/notebook";

/** A notebook_notes row as returned by the notebook server actions. */
export interface Note {
  id: number;
  roomId: number;
  userId: number;
  category: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

type IconComponent = (typeof Icons)[keyof typeof Icons];

/** Sidebar/category chrome: icon + i18n label key per category. */
export const CATEGORY_META: Record<NotebookCategory, { Icon: IconComponent; labelKey: string }> = {
  clue:     { Icon: Icons.Search,   labelKey: "catClue" },
  relation: { Icon: Icons.User,     labelKey: "catRelation" },
  timeline: { Icon: Icons.Clock,    labelKey: "catTimeline" },
  misc:     { Icon: Icons.BookOpen, labelKey: "catMisc" },
};

/** @-mention chip chrome per backpack entity type (colors are theme tokens). */
export const ENTITY_META: Record<string, { Icon: IconComponent; labelKey: string; chipClass: string }> = {
  clue:      { Icon: Icons.Search, labelKey: "typeClue", chipClass: "text-accent border-accent/40 bg-accent/10" },
  info:      { Icon: Icons.Info,   labelKey: "typeInfo", chipClass: "text-ai border-ai/40 bg-ai/10" },
  character: { Icon: Icons.User,   labelKey: "typeChar", chipClass: "text-text border-border bg-surface-alt" },
  item:      { Icon: Icons.Box,    labelKey: "typeItem", chipClass: "text-success border-success/40 bg-success/10" },
};

const FALLBACK_ENTITY_META = ENTITY_META.item;

export function entityMeta(type: string) {
  return ENTITY_META[type] ?? FALLBACK_ENTITY_META;
}

/** Inline chip for an @-linked backpack entity (used in note body + footer). */
export function MentionChip({ entity, className = "" }: { entity: NotebookLinkEntity; className?: string }) {
  const { Icon, chipClass } = entityMeta(entity.type);
  return (
    <span
      className={`notebook-mention notebook-mention--${entity.type} inline-flex items-center gap-1 align-baseline border rounded-theme px-1.5 py-px text-[0.85em] font-bold leading-snug ${chipClass} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {entity.title}
    </span>
  );
}

/** "10-14" — note-list date stamp. */
export function formatNoteDate(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "10-14 22:07" — viewer header timestamp. */
export function formatNoteDateTime(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
