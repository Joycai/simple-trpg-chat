"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { Notice } from "@/components/shared/Notice";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useOverlayTransition } from "@/lib/ui/useOverlayTransition";
import { useEscapeToClose } from "@/lib/ui/overlay-esc";
import {
  createNoteAction, updateNoteAction, deleteNoteAction, createCategoryAction, updateCategoryAction, deleteCategoryAction,
} from "@/app/actions/notebook";
import {
  extractMentions, searchNotes, stripMarkdown, type NotebookColor, type NotebookLinkEntity,
} from "@/lib/room/notebook";
import type { Note } from "./notebook-types";
import { NotebookCategoryList, type CategoryFilter } from "./NotebookCategoryList";
import { NotebookViewer } from "./NotebookViewer";
import { NotebookEditor } from "./NotebookEditor";
import { NotebookShareModal } from "./NotebookShareModal";
import { NotebookSearchInput, NotebookSearchResults } from "./NotebookSearch";
import { NotebookNoteList } from "./NotebookNoteList";
import { useNotebookData } from "./useNotebookData";
import { useNoteShare } from "./useNoteShare";
import { useNotebookBanner } from "./useNotebookBanner";
import { buildConfirmDialogProps, type NotebookConfirm } from "./notebook-confirm";
import { DetailModal } from "@/components/room/inventory/modals";
import type { Distribution, InventoryPlayer } from "@/components/room/inventory/inventory-types";
import { PaneTransition } from "@/components/shared/PaneTransition";

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
  const { close, panelRef, backdropRef, panelClass, afterEnter } = useOverlayTransition(onClose, "drawer", { closeOnEscape: false });

  const [detail, setDetail] = useState<Distribution | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ note: Note | null } | null>(null);
  /** Installed by NotebookEditor so the drawer can ask before discarding. */
  const isEditorDirty = useRef<() => boolean>(() => false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [confirm, setConfirm] = useState<NotebookConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Success / failure strip under the header (success clears itself).
  const { banner, setBanner, fail } = useNotebookBanner();

  // Notes, categories and the `@` link targets, loaded on open.
  const { notes, categories, entities, distsById, loading, error, retry, reload } = useNotebookData(roomId, afterEnter);

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

  // Sending a copy of a note to other members; success lands in the banner.
  const { sharing, sendingShare, shareError, openShare, handleShare, closeShare } = useNoteShare(
    roomId,
    (count) => setBanner({ kind: "success", text: t("shareSuccess", { count }) }),
  );

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
      <div ref={backdropRef} className="absolute inset-0 bg-scrim/30" />
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

        {/* Browse ↔ editor is a full-pane swap (新建手札 / 编辑), so it gets the
            same fade-rise as a tab change. Keyed on the mode only — NOT on the
            note being edited — so the search box inside the browse pane keeps
            its identity while typing (see the IME note below). */}
        <PaneTransition
          paneKey={editing ? "editor" : "browse"}
          className="flex-1 min-h-0 flex flex-col"
        >
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
            <NotebookSearchInput query={query} setQuery={setQuery} />
          </div>

          {query.trim() ? (
          <NotebookSearchResults results={results} query={query} categoryOf={categoryOf} onOpen={openResult} />
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
              <NotebookNoteList
                notes={listNotes}
                hasAnyNotes={notes.length > 0}
                filterKey={String(filter)}
                filterLabel={filterLabel}
                loading={loading}
                error={error}
                onRetry={retry}
                selectedId={selectedId}
                onSelect={setSelectedId}
                linkCounts={linkCounts}
                onNew={readOnly ? undefined : () => setEditing({ note: null })}
              />
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
                  onShare={() => openShare(selected)}
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
        </PaneTransition>

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
            {...buildConfirmDialogProps(confirm, t, categoryCounts)}
            busy={confirmBusy}
            onConfirm={runConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    </div>
  );
}
