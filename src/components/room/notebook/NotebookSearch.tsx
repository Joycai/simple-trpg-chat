"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { highlightSegments, type NoteSearchResult } from "@/lib/room/notebook";
import { formatMonthDay } from "@/lib/format/time";
import { CategoryChip } from "./NotebookChips";
import type { Category, Note } from "./notebook-types";

/** Highlight helper for search results. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((seg, i) =>
        seg.hl
          ? <mark key={i} className="bg-accent/25 text-accent rounded-[3px] px-0.5">{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </>
  );
}

/** Single instance, rendered above the view switch — see NotebookPanel for
 *  why it must not live inside either branch. No autoFocus: it is never
 *  remounted now, so there is nothing to restore focus from. */
export function NotebookSearchInput({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const t = useTranslations("notebook");
  return (
    <div className="relative">
      <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full bg-input-bg border border-input-border rounded-theme pl-9 pr-8 py-2 text-sm text-text outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-dim hover:text-text transition cursor-pointer"
          aria-label={t("clearSearch")}
        >
          <Icons.X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** Full-width search results, most relevant first. */
export function NotebookSearchResults({
  results,
  query,
  categoryOf,
  onOpen,
}: {
  results: NoteSearchResult<Note>[];
  query: string;
  categoryOf: (id: number | null) => Category | null;
  onOpen: (noteId: number) => void;
}) {
  const t = useTranslations("notebook");
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 sm:px-6 pt-1 shrink-0">
        <div className="flex items-center justify-between mt-1 mb-2 text-xs text-text-muted select-none">
          <span>{t("matches", { count: results.length })}</span>
          <span>{t("byRelevance")}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-2.5">
        {results.length === 0 && (
          <p className="text-sm text-text-dim text-center py-10">{t("noResults")}</p>
        )}
        {results.map(({ note, snippet }) => (
          <button
            key={note.id}
            onClick={() => onOpen(note.id)}
            className="notebook-search-card w-full text-left border border-border rounded-theme px-4 py-3 hover:border-accent/50 hover:bg-surface-alt transition cursor-pointer"
          >
            <div className="text-base font-bold text-text font-theme-display">
              <Highlighted text={note.title} query={query} />
            </div>
            {snippet && (
              <div className="text-sm text-text-muted mt-1 leading-relaxed">
                <Highlighted text={snippet} query={query} />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs">
              <CategoryChip category={categoryOf(note.categoryId)} uncategorizedLabel={t("uncategorized")} />
              <span className="text-text-dim font-theme-mono">{formatMonthDay(note.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
