"use client";

import type { NotebookLinkEntity } from "@/lib/room/notebook";
import type { Category } from "./notebook-types";
import { colorMeta, entityMeta } from "./notebook-styles";

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
