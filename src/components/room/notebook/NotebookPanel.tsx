"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import {
  getMyNotebookAction,
  createNoteAction,
  updateNoteAction,
  deleteNoteAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/notebook";
import { getMyInventory } from "@/app/actions/inventory";
import {
  extractMentions,
  highlightSegments,
  searchNotes,
  type NotebookColor,
  type NotebookLinkEntity,
} from "@/lib/notebook";
import { CategoryChip, formatNoteDate, type Category, type Note } from "./notebook-helpers";
import { NotebookCategoryList, type CategoryFilter } from "./NotebookCategoryList";
import { NotebookViewer } from "./NotebookViewer";
import { NotebookEditor } from "./NotebookEditor";
import { DetailModal } from "@/components/room/inventory/InventoryModals";
import type { InventoryItem } from "@/components/room/inventory/inventory-helpers";

interface NotebookPanelProps {
  roomId: number;
  onClose: () => void;
  readOnly?: boolean;
}

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

/**
 * 记事本 — per-user-per-room private notebook drawer. Notes load on open (no
 * SSE: nothing here is visible to anyone else). Left pane = search + editable
 * category nav (user categories with one of 7 label colors) + note list;
 * right pane = viewer. A non-empty search replaces the panes with a
 * full-width result list; editing replaces them with the editor.
 */
export function NotebookPanel({ roomId, onClose, readOnly = false }: NotebookPanelProps) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  // Full backpack rows behind the link entities, so a clicked chip can open
  // the same detail view the backpack shows (keyed by inventory item id).
  const [itemsById, setItemsById] = useState<Map<number, InventoryItem>>(new Map());
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ note: Note | null } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [notebook, inventory] = await Promise.all([
          getMyNotebookAction(roomId),
          getMyInventory(roomId),
        ]);
        setNotes(notebook.notes as Note[]);
        setCategories(notebook.categories as Category[]);
        // Backpack entries → linkable entities (dedupe by item id: shared
        // copies of the same item may produce several distributions).
        const byId = new Map<number, InventoryItem>();
        const linkable: NotebookLinkEntity[] = [];
        for (const dist of inventory as Array<{ item?: InventoryItem | null }>) {
          const item = dist.item;
          if (item && !byId.has(item.id)) {
            byId.set(item.id, item);
            linkable.push({ id: item.id, type: item.type, title: item.title });
          }
        }
        setEntities(linkable);
        setItemsById(byId);
      } catch { /* panel simply shows the empty state */ }
      setLoading(false);
    })();
  }, [roomId]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const categoryOf = (id: number | null) => categories.find((c) => c.id === id) ?? null;

  const linkCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const n of notes) counts.set(n.id, extractMentions(n.content, entities).length);
    return counts;
  }, [notes, entities]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<number | null, number>();
    for (const n of notes) counts.set(n.categoryId, (counts.get(n.categoryId) ?? 0) + 1);
    return counts;
  }, [notes]);

  const listNotes =
    filter === "all" ? notes
    : filter === "uncat" ? notes.filter((n) => n.categoryId === null)
    : notes.filter((n) => n.categoryId === filter);
  const filterLabel =
    filter === "all" ? t("catAll")
    : filter === "uncat" ? t("uncategorized")
    : categoryOf(filter)?.name ?? "";
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);

  const reload = async () => {
    const notebook = await getMyNotebookAction(roomId);
    setNotes(notebook.notes as Note[]);
    setCategories(notebook.categories as Category[]);
  };

  const handleSave = async (input: { title: string; content: string; categoryId: number | null }) => {
    const saved = editing?.note
      ? await updateNoteAction(roomId, editing.note.id, input)
      : await createNoteAction(roomId, input);
    await reload();
    setEditing(null);
    setSelectedId(saved.id);
  };

  const handleDelete = async (note: Note) => {
    if (!confirm(t("deleteConfirm", { title: note.title }))) return;
    try {
      await deleteNoteAction(roomId, note.id);
      setSelectedId(null);
      await reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    }
  };

  const wrapCategoryError = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCommon("error"));
      throw err;
    }
  };

  const handleCategoryCreate = (input: { name: string; color: NotebookColor }) =>
    wrapCategoryError(() => createCategoryAction(roomId, input));

  const handleCategoryUpdate = (id: number, input: { name: string; color: NotebookColor }) =>
    wrapCategoryError(() => updateCategoryAction(roomId, id, input));

  const handleCategoryDelete = async (category: Category) => {
    const count = categoryCounts.get(category.id) ?? 0;
    if (!confirm(t("deleteCategoryConfirm", { name: category.name, count }))) return;
    await wrapCategoryError(() => deleteCategoryAction(roomId, category.id));
    if (filter === category.id) setFilter("all");
  };

  const openResult = (id: number) => {
    setQuery("");
    setSelectedId(id);
  };

  /** A clicked @-chip opens the entry's backpack detail (view-only). */
  const handleOpenEntity = (entity: NotebookLinkEntity) => {
    const item = itemsById.get(entity.id);
    if (item) setDetailItem(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div
        className={`notebook-panel relative ml-auto w-full sm:w-[44rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="bg-surface border-b border-border px-4 sm:px-6 py-4 flex items-center gap-3 shrink-0">
          <Icons.NotebookPen className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-text text-xl font-theme-display flex-1">{t("title")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer" aria-label={tCommon("close")}>
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {editing ? (
          <NotebookEditor
            note={editing.note}
            categories={categories}
            entities={entities}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        ) : query.trim() ? (
          /* Full-width search results */
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 sm:px-6 pt-4 shrink-0">
              <SearchInput query={query} setQuery={setQuery} autoFocus />
              <div className="flex items-center justify-between mt-3 mb-2 text-xs text-text-muted select-none">
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
                  onClick={() => openResult(note.id)}
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
                    <span className="text-text-dim font-theme-mono">{formatNoteDate(note.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Two panes: sidebar (search/categories/list) + note viewer */
          <div className="flex-1 min-h-0 flex">
            <div className={`${selected ? "hidden sm:flex" : "flex"} w-full sm:w-60 sm:border-r border-border flex-col min-h-0 shrink-0`}>
              <div className="px-3 pt-3 shrink-0">
                <SearchInput query={query} setQuery={setQuery} />
              </div>
              <div className="px-3 pt-3 pb-2 border-b border-border shrink-0 overflow-y-auto max-h-[45%]">
                <NotebookCategoryList
                  categories={categories}
                  counts={categoryCounts}
                  totalCount={notes.length}
                  active={filter}
                  onSelect={setFilter}
                  readOnly={readOnly}
                  onCreate={handleCategoryCreate}
                  onUpdate={handleCategoryUpdate}
                  onDelete={handleCategoryDelete}
                />
              </div>
              <div className="px-3 pt-2.5 pb-1 text-[11px] text-text-dim select-none shrink-0">
                {filterLabel} · {listNotes.length}
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1.5">
                {loading && <p className="text-xs text-text-dim px-1 py-4">{tCommon("loading")}</p>}
                {!loading && listNotes.length === 0 && (
                  <p className="text-xs text-text-dim px-1 py-4">{t("emptyList")}</p>
                )}
                {listNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`notebook-note-item w-full text-left px-3 py-2.5 rounded-theme border transition cursor-pointer ${
                      n.id === selectedId
                        ? "border-accent/60 bg-accent/[0.07]"
                        : "border-transparent hover:bg-surface-alt"
                    }`}
                  >
                    <div className="text-sm font-bold text-text truncate">{n.title}</div>
                    <div className="text-[11px] text-text-dim font-theme-mono mt-0.5">
                      {formatNoteDate(n.updatedAt)}
                      {(linkCounts.get(n.id) ?? 0) > 0 && <> · {t("linksCount", { count: linkCounts.get(n.id)! })}</>}
                    </div>
                  </button>
                ))}
              </div>
              {!readOnly && (
                <div className="p-3 shrink-0">
                  <button
                    onClick={() => setEditing({ note: null })}
                    className="notebook-new-btn w-full flex items-center justify-center gap-1.5 border border-dashed border-accent/50 text-accent rounded-theme py-2.5 text-sm font-bold hover:bg-accent/10 transition cursor-pointer"
                  >
                    <Icons.Plus className="w-4 h-4" /> {t("newNote")}
                  </button>
                </div>
              )}
            </div>

            <div className={`${selected ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col min-h-0`}>
              {selected ? (
                <NotebookViewer
                  note={selected}
                  category={categoryOf(selected.categoryId)}
                  entities={entities}
                  readOnly={readOnly}
                  onEdit={() => setEditing({ note: selected })}
                  onDelete={() => handleDelete(selected)}
                  onBack={() => setSelectedId(null)}
                  onOpenEntity={handleOpenEntity}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-dim select-none">
                  <Icons.BookOpen className="w-10 h-10 opacity-40" />
                  <p className="text-sm">{loading ? tCommon("loading") : t("emptySelect")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Backpack detail of a clicked @-chip — view-only reuse of the
            inventory DetailModal (no dist/history: share/edit stay hidden). */}
        {detailItem && (
          <DetailModal
            detailItem={detailItem}
            detailDist={null}
            isHost={false}
            history={[]}
            readOnly={true}
            onClose={() => setDetailItem(null)}
            onEdit={() => {}}
            onShareOpen={() => {}}
            onDistribute={() => {}}
          />
        )}
      </div>
    </div>
  );
}

function SearchInput({ query, setQuery, autoFocus = false }: { query: string; setQuery: (q: string) => void; autoFocus?: boolean }) {
  const t = useTranslations("notebook");
  return (
    <div className="relative">
      <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        autoFocus={autoFocus}
        className="w-full bg-input-bg border border-input-border rounded-theme pl-9 pr-8 py-2 text-sm text-text outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-dim hover:text-text transition cursor-pointer"
          aria-label="clear"
        >
          <Icons.X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
