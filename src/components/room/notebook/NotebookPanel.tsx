"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { LoadFailed } from "@/components/shared/LoadFailed";
import { Notice } from "@/components/shared/Notice";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { useEscapeToClose } from "@/lib/overlay-esc";
import {
  getMyNotebookAction,
  createNoteAction,
  updateNoteAction,
  deleteNoteAction,
  shareNoteAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/notebook";
import { getMyInventory } from "@/app/actions/inventory";
import { getMyEventsAction } from "@/app/actions/event";
import {
  extractMentions,
  highlightSegments,
  searchNotes,
  stripMarkdown,
  type NotebookColor,
  type NotebookLinkEntity,
} from "@/lib/notebook";
import { CategoryChip, formatNoteDate, type Category, type Note } from "./notebook-helpers";
import { NotebookCategoryList, type CategoryFilter } from "./NotebookCategoryList";
import { NotebookViewer } from "./NotebookViewer";
import { NotebookEditor } from "./NotebookEditor";
import { NotebookShareModal } from "./NotebookShareModal";
import { DetailModal } from "@/components/room/inventory/InventoryModals";
import type { Distribution, InventoryPlayer } from "@/components/room/inventory/inventory-helpers";

interface NotebookPanelProps {
  roomId: number;
  /** The current user — sender identity, excluded from share recipients. */
  userId: number;
  /** Room members, for the share-recipient picker. */
  players: InventoryPlayer[];
  /** Opens an event's detail modal — rendered at the room's top level, so a
   *  clicked event @-chip is not trapped inside this drawer. */
  onOpenEvent?: (eventId: number) => void;
  onClose: () => void;
  readOnly?: boolean;
}

/** Themed stand-in for `alert()` — rendered as a strip under the panel header. */
type Banner = { kind: "success" | "error"; text: string };

/** Themed stand-in for `confirm()`. `discard` carries the action it guards, so
 *  the drawer-close and the editor-back paths share one dialog. */
type Confirm =
  | { kind: "discard"; proceed: () => void }
  | { kind: "deleteNote"; note: Note }
  | { kind: "deleteCategory"; category: Category };

/** How long a success banner stays up before fading itself out. */
const BANNER_TTL = 3200;

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
export function NotebookPanel({ roomId, userId, players, onOpenEvent, onClose, readOnly = false }: NotebookPanelProps) {
  const t = useTranslations("notebook");
  const tCommon = useTranslations("common");
  // Escape must route through the dirty-editor guard like every other close
  // path, so the default Escape-closes behavior is disabled and re-registered
  // below with `guardedClose` (declared after the guard's dependencies).
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onClose, "drawer", { closeOnEscape: false });

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<NotebookLinkEntity[]>([]);
  // Full backpack rows behind the link entities, so a clicked chip can open
  // the same detail view the backpack shows (keyed by inventory item id).
  // The distribution rides along: DetailModal derives the 持有 line from it.
  const [distsById, setDistsById] = useState<Map<number, Distribution>>(new Map());
  const [detail, setDetail] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ note: Note | null } | null>(null);
  /** Installed by NotebookEditor so the drawer can ask before discarding. */
  const isEditorDirty = useRef<() => boolean>(() => false);
  const [sharing, setSharing] = useState<Note | null>(null);
  const [sendingShare, setSendingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // A success banner is an acknowledgement, not a message to act on — it clears
  // itself. Errors stay until dismissed or replaced.
  useEffect(() => {
    if (banner?.kind !== "success") return;
    const id = setTimeout(() => setBanner(null), BANNER_TTL);
    return () => clearTimeout(id);
  }, [banner]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // allSettled, not all: the notes are the panel's reason to exist, while
      // the backpack and event lists only enrich `@` mentions. Failing them
      // together meant one blip on either extra showed "no notes yet" to
      // someone whose notes were fine — and invited them to rewrite one.
      const [notebook, inventory, myEvents] = await Promise.allSettled([
        getMyNotebookAction(roomId),
        getMyInventory(roomId),
        getMyEventsAction(roomId),
      ]);
      if (!alive) return;

      if (notebook.status === "fulfilled") {
        setNotes(notebook.value.notes as Note[]);
        setCategories(notebook.value.categories as Category[]);
        setError(false);
      } else {
        setError(true);
      }

      // Mentions degrade gracefully: with no entities `segmentMentions` returns
      // the text unchanged, so an `@Title` just reads as plain text.
      const byId = new Map<number, Distribution>();
      const linkable: NotebookLinkEntity[] = [];
      if (inventory.status === "fulfilled") {
        // Backpack entries → linkable entities (dedupe by item id: shared
        // copies of the same item may produce several distributions).
        for (const dist of inventory.value as Distribution[]) {
          const item = dist.item;
          if (item && !byId.has(item.id)) {
            byId.set(item.id, dist);
            linkable.push({ id: item.id, type: item.type, title: item.title });
          }
        }
      }
      if (myEvents.status === "fulfilled") {
        // Events the viewer may read are also linkable (#7). Negate the id so it
        // never collides with a backpack item id in the shared entity list.
        for (const ev of myEvents.value) {
          linkable.push({ id: -ev.id, type: "event", title: ev.title });
        }
      }
      setEntities(linkable);
      setDistsById(byId);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [roomId, retryKey]);

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
  // Strip markdown once per notes change, not once per keystroke; and search on
  // a deferred copy of the query so typing never waits on the scan.
  const plainByNoteId = useMemo(
    () => new Map(notes.map((n) => [n.id, stripMarkdown(n.content)])),
    [notes],
  );
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => searchNotes(notes, deferredQuery, plainByNoteId),
    [notes, deferredQuery, plainByNoteId],
  );

  const reload = async () => {
    const notebook = await getMyNotebookAction(roomId);
    setNotes(notebook.notes as Note[]);
    setCategories(notebook.categories as Category[]);
  };

  const fail = (text?: string) => setBanner({ kind: "error", text: text ?? tCommon("error") });

  // Actions return `{ success, error }` with the message already localized on
  // the server; the old `err.message` path surfaced Next's production redaction
  // notice to the user instead. The catch covers what never reaches that shape
  // — a dropped connection mid-save — so the editor is never left silent.
  const handleSave = async (input: { title: string; content: string; categoryId: number | null }) => {
    try {
      const res = editing?.note
        ? await updateNoteAction(roomId, editing.note.id, input)
        : await createNoteAction(roomId, input);
      if (!res.success) {
        fail(res.error);
        return;
      }
      await reload();
      setEditing(null);
      setSelectedId(res.note.id);
    } catch {
      fail();
    }
  };

  /** Category editors expect a rejection to keep their inline form open. */
  const wrapCategoryError = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.success) {
      fail(res.error);
      throw new Error(res.error ?? "failed");
    }
    await reload();
  };

  const handleCategoryCreate = (input: { name: string; color: NotebookColor }) =>
    wrapCategoryError(() => createCategoryAction(roomId, input));

  const handleCategoryUpdate = (id: number, input: { name: string; color: NotebookColor }) =>
    wrapCategoryError(() => updateCategoryAction(roomId, id, input));

  const handleShare = async (targetIds: number[]) => {
    if (!sharing || targetIds.length === 0) return;
    setSendingShare(true);
    setShareError(null);
    try {
      const res = await shareNoteAction(roomId, sharing.id, targetIds);
      // Reported inside the picker, which stays open: the selection is still
      // there to retry with, and a banner behind the modal would be unreadable.
      if (!res.success) {
        setShareError(res.error);
        return;
      }
      setSharing(null);
      setBanner({ kind: "success", text: t("shareSuccess", { count: res.count }) });
    } catch {
      setShareError(tCommon("error"));
    } finally {
      setSendingShare(false);
    }
  };

  const closeShare = () => {
    setSharing(null);
    setShareError(null);
  };

  /** Runs the pending confirm. Destructive branches always dismiss the dialog
   *  when they settle, so a failure banner isn't left behind the backdrop. */
  const runConfirm = async () => {
    if (!confirm || confirmBusy) return;
    if (confirm.kind === "discard") {
      const { proceed } = confirm;
      setConfirm(null);
      proceed();
      return;
    }
    setConfirmBusy(true);
    try {
      if (confirm.kind === "deleteNote") {
        const res = await deleteNoteAction(roomId, confirm.note.id);
        if (!res.success) {
          fail(res.error);
          return;
        }
        setSelectedId(null);
        await reload();
      } else {
        const { category } = confirm;
        const res = await deleteCategoryAction(roomId, category.id);
        if (!res.success) {
          fail(res.error);
          return;
        }
        await reload();
        if (filter === category.id) setFilter("all");
      }
    } catch {
      fail();
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  };

  const openResult = (id: number) => {
    setQuery("");
    setSelectedId(id);
  };

  /**
   * A clicked @-chip opens its detail: backpack entries in the view-only
   * inventory modal, events in the event modal. Event ids are stored negated
   * so they cannot collide with item ids, which also meant they never matched
   * `distsById` — the chip rendered as a button and silently did nothing.
   */
  const handleOpenEntity = (entity: NotebookLinkEntity) => {
    if (entity.id < 0) {
      onOpenEvent?.(-entity.id);
      return;
    }
    const dist = distsById.get(entity.id);
    if (dist?.item) setDetail(dist);
  };

  // Closing the drawer unmounts the editor, so a mistouch on the backdrop used
  // to discard an in-progress note with no way back. The editor keeps the
  // authoritative answer; we just ask before tearing it down. Both teardown
  // paths — the drawer closing and the editor's back arrow — route through
  // here, so the question is asked in one place instead of two.
  const guardDiscard = (proceed: () => void) => {
    if (editing && isEditorDirty.current()) setConfirm({ kind: "discard", proceed });
    else proceed();
  };
  const guardedClose = () => guardDiscard(close);
  useEscapeToClose(guardedClose);

  return (
    <div className="fixed inset-0 z-50 flex font-theme" onClick={guardedClose}>
      <div ref={backdropRef} className="absolute inset-0 bg-black/30" />
      <div
        ref={panelRef} className={`notebook-panel relative ml-auto w-full sm:w-[44rem] bg-surface border-l border-border shadow-2xl h-full flex flex-col overflow-hidden ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="bg-surface border-b border-border px-4 sm:px-6 py-4 flex items-center gap-3 shrink-0">
          <Icons.NotebookPen className="w-5 h-5 text-accent" />
          <h3 className="font-bold text-text text-xl font-theme-display flex-1">{t("title")}</h3>
          <button onClick={guardedClose} className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer" aria-label={tCommon("close")}>
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        {/* Themed replacement for the module's `alert()` calls. Sits above the
            view switch so it survives list ↔ search ↔ editor. */}
        {banner && (
          <Notice
            variant={banner.kind}
            className="mx-4 sm:mx-6 mt-3 shrink-0"
            onDismiss={() => setBanner(null)}
            dismissLabel={tCommon("close")}
          >
            {banner.text}
          </Notice>
        )}

        {editing ? (
          <NotebookEditor
            note={editing.note}
            categories={categories}
            entities={entities}
            dirtyRef={isEditorDirty}
            onCancel={() => guardDiscard(() => setEditing(null))}
            onSave={handleSave}
          />
        ) : (
        /* One fixed search header above a body that swaps on `query`.
           The box used to live inside each branch at a different tree depth,
           so going from empty to non-empty remounted the <input>. Chrome
           dispatches `input` during IME composition, so a zh user typing pinyin
           destroyed their own composition session mid-word — on the default
           locale's highest-traffic control. Same node in both states now. */
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 sm:px-6 pt-4 pb-1 shrink-0">
            <SearchInput query={query} setQuery={setQuery} />
          </div>

          {query.trim() ? (
          /* Full-width search results */
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
                  onDelete={(category) => setConfirm({ kind: "deleteCategory", category })}
                />
              </div>
              <div className="px-3 pt-2.5 pb-1 text-[11px] text-text-dim select-none shrink-0">
                {filterLabel} · {listNotes.length}
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1.5">
                {loading && <p className="text-xs text-text-dim px-1 py-4">{tCommon("loading")}</p>}
                {!loading && error && notes.length === 0 && (
                  <LoadFailed onRetry={() => setRetryKey((k) => k + 1)} className="py-8" />
                )}
                {!loading && !error && listNotes.length === 0 && (
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
                    {n.sourceName && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-ai border border-ai/40 bg-ai/10 rounded-full px-1.5 py-px max-w-full">
                        <Icons.Send className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{t("receivedFrom", { name: n.sourceName })}</span>
                      </div>
                    )}
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
                  onDelete={() => setConfirm({ kind: "deleteNote", note: selected })}
                  onShare={() => { setShareError(null); setSharing(selected); }}
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
        </div>
        )}

        {/* Backpack detail of a clicked @-chip — view-only reuse of the
            inventory DetailModal (readOnly hides share/edit/distribute; the
            distribution supplies the 持有 holder line). */}
        {detail?.item && (
          <DetailModal
            detailItem={detail.item}
            detailDist={detail}
            isHost={false}
            history={[]}
            readOnly={true}
            onClose={() => setDetail(null)}
            onEdit={() => {}}
            onShareOpen={() => {}}
            onDistribute={() => {}}
          />
        )}

        {/* Send a copy of a note to other members (an independent copy — the
            recipient's edits and mine never sync). */}
        {sharing && (
          <NotebookShareModal
            note={sharing}
            players={players}
            userId={userId}
            sending={sendingShare}
            error={shareError}
            onCancel={closeShare}
            onShare={handleShare}
          />
        )}

        {/* Themed replacement for the module's `confirm()` calls. Portals to
            the body for correct centering; React events still bubble to the
            panel's stopPropagation, so a click inside cannot close the drawer. */}
        {confirm && (
          <ConfirmDialog
            title={
              confirm.kind === "discard" ? t("discardConfirmTitle")
              : confirm.kind === "deleteNote" ? t("deleteConfirmTitle")
              : t("deleteCategoryConfirmTitle")
            }
            description={
              confirm.kind === "discard" ? t("discardConfirm")
              : confirm.kind === "deleteNote" ? t("deleteConfirm", { title: confirm.note.title })
              : t("deleteCategoryConfirm", {
                  name: confirm.category.name,
                  count: categoryCounts.get(confirm.category.id) ?? 0,
                })
            }
            confirmLabel={
              confirm.kind === "discard" ? t("discardConfirmAction")
              : confirm.kind === "deleteNote" ? t("delete")
              : t("deleteCategory")
            }
            icon={confirm.kind === "discard" ? undefined : <Icons.Trash2 className="w-5 h-5" />}
            busy={confirmBusy}
            onConfirm={runConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Single instance, rendered above the view switch — see the comment there for
 *  why it must not live inside either branch. No autoFocus: it is never
 *  remounted now, so there is nothing to restore focus from. */
function SearchInput({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
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
