"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { LoadFailed } from "@/components/shared/LoadFailed";
import { PaneTransition } from "@/components/shared/PaneTransition";
import { formatMonthDay } from "@/lib/format/time";
import type { Note } from "./notebook-types";

/** The sidebar below the category list: the active category's label and
 *  count, its notes (with loading, failed and empty states), and the new-note
 *  button. */
export function NotebookNoteList({
  notes,
  hasAnyNotes,
  filterKey,
  filterLabel,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  linkCounts,
  onNew,
}: {
  /** Notes in the active category. */
  notes: Note[];
  /** Whether the viewer has any note at all — a failed load only shows when not. */
  hasAnyNotes: boolean;
  /** Identifies the active category, so switching it plays the pane transition. */
  filterKey: string;
  filterLabel: string;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (noteId: number) => void;
  /** `@` links per note id. */
  linkCounts: Map<number, number>;
  /** Starts a new note; absent when read-only. */
  onNew?: () => void;
}) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");
  return (
    <>
      <div className="px-3 pt-2.5 pb-1 text-[11px] text-text-dim select-none shrink-0">
        {filterLabel} · {notes.length}
      </div>
      {/* The pane sits inside the scroll container, not around it, so
          the scrollbar isn't recreated on every category switch.
          `space-y` moves onto the pane because it styles direct
          children, and the pane is now the notes' parent. */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <PaneTransition paneKey={filterKey} className="space-y-1.5">
          {loading && <p className="text-xs text-text-dim px-1 py-4">{tCommon("loading")}</p>}
          {!loading && error && !hasAnyNotes && (
            <LoadFailed onRetry={onRetry} className="py-8" />
          )}
          {!loading && !error && notes.length === 0 && (
            <p className="text-xs text-text-dim px-1 py-4">{t("emptyList")}</p>
          )}
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={`notebook-note-item w-full text-left px-3 py-2.5 rounded-theme border transition cursor-pointer ${
                n.id === selectedId
                  ? "border-accent/60 bg-accent/[0.07]"
                  : "border-transparent hover:bg-surface-alt"
              }`}
            >
              <div className="text-sm font-bold text-text truncate">{n.title}</div>
              <div className="text-[11px] text-text-dim font-theme-mono mt-0.5">
                {formatMonthDay(n.updatedAt)}
                {(linkCounts.get(n.id) ?? 0) > 0 && <> · {t("linksCount", { count: linkCounts.get(n.id)! })}</>}
              </div>
              {n.sourceName && (
                <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-ai border border-ai/40 bg-ai/10 rounded-full px-1.5 py-px max-w-full">
                  <Icons.Send className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{t("receivedFrom", { name: n.sourceName })}</span>
                </div>
              )}
            </button>
          ))}
        </PaneTransition>
      </div>
      {onNew && (
        <div className="p-3 shrink-0">
          <button
            onClick={onNew}
            className="notebook-new-btn w-full flex items-center justify-center gap-1.5 border border-dashed border-accent/50 text-accent rounded-theme py-2.5 text-sm font-bold hover:bg-accent/10 transition cursor-pointer"
          >
            <Icons.Plus className="w-4 h-4" /> {t("newNote")}
          </button>
        </div>
      )}
    </>
  );
}
