"use client";

import { useTranslations } from "next-intl";
import { entityMeta } from "@/components/room/notebook/notebook-helpers";
import type { NotebookLinkEntity } from "@/lib/notebook";

/**
 * The `@`-mention suggestion popover, shared by the notebook and event editors.
 * Both rendered the same markup with only the positioning classes differing —
 * that is what `className` is for. Pair it with `useMentionTextarea`.
 */
export function MentionPicker({
  query,
  suggestions,
  activeIdx,
  onPick,
  onHover,
  className = "",
  accentClass = "text-accent",
}: {
  query: string;
  suggestions: NotebookLinkEntity[];
  activeIdx: number;
  onPick: (entity: NotebookLinkEntity) => void;
  onHover: (index: number) => void;
  /** Positioning for the host editor; the chrome itself is identical. */
  className?: string;
  /** Editors own different accents (notebook = accent, event = primary). */
  accentClass?: string;
}) {
  const t = useTranslations("notebook");
  return (
    <div className={`notebook-mention-picker absolute bg-surface border border-border rounded-theme shadow-xl overflow-hidden z-10 ${className}`}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border">
        <span className={`text-sm font-bold font-theme-mono ${accentClass}`}>@{query}</span>
        <span className="text-xs text-text-muted">{t("mentionHeader")}</span>
      </div>
      <div className="max-h-56 overflow-y-auto py-1">
        {suggestions.map((e, i) => {
          const { Icon, labelKey, chipClass } = entityMeta(e.type);
          return (
            <button
              key={e.id}
              // mousedown, not click: the textarea's blur would otherwise close
              // the picker before the click landed.
              onMouseDown={(ev) => { ev.preventDefault(); onPick(e); }}
              onMouseEnter={() => onHover(i)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 transition cursor-pointer ${i === activeIdx ? "bg-surface-alt" : ""}`}
            >
              <span className={`flex items-center justify-center w-8 h-8 rounded-theme border shrink-0 ${chipClass}`}>
                <Icon className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-text truncate">{e.title}</span>
                <span className="block text-xs text-text-muted">{t(labelKey)} · {t("fromBackpack")}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-3.5 py-1.5 border-t border-border text-[11px] text-text-dim select-none">
        <span>↑↓ {t("mentionSelect")} · ⏎ {t("mentionInsert")}</span>
        <span>{t("mentionItems", { count: suggestions.length })}</span>
      </div>
    </div>
  );
}
