"use client";

import { Icons } from "@/components/shared/icons";
import type { NotebookColor, NotebookLinkEntity } from "@/lib/notebook";

/** A notebook_notes row as returned by the notebook server actions. */
export interface Note {
  id: number;
  roomId: number;
  userId: number;
  categoryId: number | null;
  title: string;
  content: string;
  /** Sender's display-name snapshot when this note is a received copy (else null). */
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A notebook_categories row. */
export interface Category {
  id: number;
  roomId: number;
  userId: number;
  name: string;
  color: string;
  createdAt: string;
}

/**
 * Class bundles per predefined label color. All theme tokens — a category
 * label recolors automatically with the active theme. Full literal strings
 * (no interpolation) so Tailwind's scanner sees every class.
 *   chip   — tinted pill (viewer header, search cards, sidebar rows)
 *   chipOn — selected/active pill (editor picker, active sidebar row)
 *   dot    — small round swatch (sidebar rows, color picker)
 */
export const COLOR_META: Record<NotebookColor, { chip: string; chipOn: string; dot: string }> = {
  primary: { chip: "text-primary border-primary/40 bg-primary/10",    chipOn: "text-primary border-primary bg-primary/15",    dot: "bg-primary" },
  accent:  { chip: "text-accent border-accent/40 bg-accent/10",       chipOn: "text-accent border-accent bg-accent/15",       dot: "bg-accent" },
  success: { chip: "text-success border-success/40 bg-success/10",    chipOn: "text-success border-success bg-success/15",    dot: "bg-success" },
  warning: { chip: "text-warning border-warning/40 bg-warning/10",    chipOn: "text-warning border-warning bg-warning/15",    dot: "bg-warning" },
  danger:  { chip: "text-danger border-danger/40 bg-danger/10",       chipOn: "text-danger border-danger bg-danger/15",       dot: "bg-danger" },
  ai:      { chip: "text-ai border-ai/40 bg-ai/10",                   chipOn: "text-ai border-ai bg-ai/15",                   dot: "bg-ai" },
  neutral: { chip: "text-text-muted border-border bg-surface-alt",    chipOn: "text-text border-text-muted bg-surface-alt",   dot: "bg-text-muted" },
};

export function colorMeta(color: string) {
  return COLOR_META[color as NotebookColor] ?? COLOR_META.neutral;
}

/** Tinted category pill (viewer header / search cards). Null = uncategorized. */
export function CategoryChip({ category, uncategorizedLabel }: { category: Category | null; uncategorizedLabel: string }) {
  const meta = colorMeta(category?.color ?? "neutral");
  return (
    <span className={`notebook-cat-chip inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
      {category?.name ?? uncategorizedLabel}
    </span>
  );
}

type IconComponent = (typeof Icons)[keyof typeof Icons];

/** @-mention chip chrome per backpack entity type (colors are theme tokens). */
export const ENTITY_META: Record<string, { Icon: IconComponent; labelKey: string; chipClass: string }> = {
  clue:      { Icon: Icons.Search, labelKey: "typeClue", chipClass: "text-accent border-accent/40 bg-accent/10" },
  info:      { Icon: Icons.Info,   labelKey: "typeInfo", chipClass: "text-ai border-ai/40 bg-ai/10" },
  character: { Icon: Icons.User,   labelKey: "typeChar", chipClass: "text-text border-border bg-surface-alt" },
  item:      { Icon: Icons.Box,    labelKey: "typeItem", chipClass: "text-success border-success/40 bg-success/10" },
  event:     { Icon: Icons.ScrollText, labelKey: "typeEvent", chipClass: "text-primary border-primary/40 bg-primary/10" },
};

const FALLBACK_ENTITY_META = ENTITY_META.item;

export function entityMeta(type: string) {
  return ENTITY_META[type] ?? FALLBACK_ENTITY_META;
}

/**
 * Inline chip for an @-linked backpack entity (used in note body + footer).
 * With `onClick` it renders as a button that opens the entry's detail — chips
 * only render for entities still present in the backpack, so a clickable chip
 * is always a valid target (deleted items degrade to plain text upstream).
 */
export function MentionChip({ entity, className = "", onClick }: { entity: NotebookLinkEntity; className?: string; onClick?: (entity: NotebookLinkEntity) => void }) {
  const { Icon, chipClass } = entityMeta(entity.type);
  const shared = `notebook-mention notebook-mention--${entity.type} inline-flex items-center gap-1 align-baseline border rounded-theme px-1.5 py-px text-[0.85em] font-bold leading-snug ${chipClass} ${className}`;
  if (!onClick) {
    return (
      <span className={shared}>
        <Icon className="w-3 h-3 shrink-0" />
        {entity.title}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onClick(entity)}
      className={`${shared} cursor-pointer hover:brightness-110 hover:underline underline-offset-2 transition`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {entity.title}
    </button>
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
