"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import {
  getRoomEventsAction,
  reorderEventAction,
  retractEventAction,
  deleteEventAction,
  type EventView,
  type ReorderOp,
} from "@/app/actions/event";
import { EventEditor } from "./EventEditor";
import { EventPublishDialog } from "./EventPublishDialog";
import { StatusBadge, EventTimeLabel, EventBodyPreview, useBackpackEntities, type EventPlayer } from "./event-helpers";

interface ManagedEvent {
  id: number;
  title: string;
  description: string;
  timePayload: string | null;
  images: string[];
  status: "unpublished" | "partial" | "full";
  sortOrder: number;
  knowers: { userId: number; nickname: string }[];
}

interface EventManagePanelProps {
  roomId: number;
  players: EventPlayer[];
  refreshKey: number;
  onClose: () => void;
  onChanged: () => void;
  /** Open an event's detail modal — the host's surface for retract / viewers. */
  onOpenEvent: (eventId: number) => void;
}

export function EventManagePanel({ roomId, players, refreshKey, onClose, onChanged, onOpenEvent }: EventManagePanelProps) {
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const entities = useBackpackEntities(roomId, refreshKey);

  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventView | "new" | null>(null);
  const [publishFor, setPublishFor] = useState<{ event: EventView; variant: "publish" | "add"; known: number[] } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "retract" | "delete"; event: ManagedEvent } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const rows = await getRoomEventsAction(roomId);
        if (alive) setEvents(rows as ManagedEvent[]);
      } catch { /* empty state */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [roomId, refreshKey]);

  const toView = (e: ManagedEvent): EventView => ({
    id: e.id, title: e.title, description: e.description, timePayload: e.timePayload,
    images: e.images, status: e.status, sortOrder: e.sortOrder, updated: false,
  });

  const doReorder = async (id: number, op: ReorderOp) => {
    try {
      await reorderEventAction(roomId, id, op);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    }
  };
  const askPosition = (e: ManagedEvent, index: number) => {
    const raw = window.prompt(t("positionPrompt", { count: events.length }), String(index + 1));
    if (raw == null) return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) doReorder(e.id, { index: n });
  };
  const doConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "retract") await retractEventAction(roomId, confirm.event.id);
      else await deleteEventAction(roomId, confirm.event.id);
      onChanged();
      setConfirm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setConfirmBusy(false);
    }
  };
  return (
    <OverlayShell onClose={onClose} variant="drawer" panelClassName="w-full max-w-2xl h-full bg-surface theme-border border-l border-border shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
            <Icons.Flag className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-text text-lg font-theme-display flex-1">{t("manageTitle")}</h3>
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-theme bg-primary text-primary-foreground text-sm font-bold shadow-[var(--theme-glow)] hover:bg-primary-hover transition cursor-pointer"
            >
              <Icons.Plus className="w-4 h-4" /> {t("newEvent")}
            </button>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer ml-1"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-text-muted"><Icons.Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-text-dim">
                <Icons.Flag className="w-10 h-10 opacity-50" />
                <p className="text-sm">{t("emptyManage")}</p>
              </div>
            ) : (
              events.map((e, i) => (
                <EventRow
                  key={e.id}
                  index={i}
                  total={events.length}
                  event={e}
                  onOrd={() => askPosition(e, i)}
                  onReorder={(op) => doReorder(e.id, op)}
                  onOpen={() => onOpenEvent(e.id)}
                  onEdit={() => setEditing(toView(e))}
                  onPublish={() => setPublishFor({ event: toView(e), variant: "publish", known: [] })}
                  onAdd={() => setPublishFor({ event: toView(e), variant: "add", known: e.knowers.map((k) => k.userId) })}
                  onDelete={() => setConfirm({ kind: "delete", event: e })}
                />
              ))
            )}
          </div>

          {editing && (
            <EventEditor
              roomId={roomId}
              event={editing === "new" ? null : editing}
              entities={entities}
              onClose={() => setEditing(null)}
              onSaved={onChanged}
            />
          )}
          {publishFor && (
            <EventPublishDialog
              roomId={roomId}
              event={publishFor.event}
              players={players}
              variant={publishFor.variant}
              knownIds={publishFor.known}
              onClose={() => setPublishFor(null)}
              onDone={onChanged}
            />
          )}
          {confirm && (
            <OverlayShell onClose={() => setConfirm(null)} panelClassName="w-full max-w-sm mx-4 bg-surface theme-border rounded-theme shadow-2xl overflow-hidden">
              {(c) => (
                <div className="p-5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Icons.AlertTriangle className="w-5 h-5 text-danger" />
                    <h4 className="font-bold text-text">{confirm.kind === "retract" ? t("retractTitle") : t("deleteTitle")}</h4>
                  </div>
                  <p className="text-sm text-text-muted mb-5">
                    {confirm.kind === "retract" ? t("retractConfirm", { title: confirm.event.title }) : t("deleteConfirm", { title: confirm.event.title })}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button onClick={c} className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer">{tCommon("cancel")}</button>
                    <button
                      onClick={doConfirm}
                      disabled={confirmBusy}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-theme bg-danger text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                    >
                      {confirmBusy && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
                      {confirm.kind === "retract" ? t("retractAction") : t("delete")}
                    </button>
                  </div>
                </div>
              )}
            </OverlayShell>
          )}
        </>
      )}
    </OverlayShell>
  );
}

function EventRow({
  index, total, event, onOrd, onReorder, onOpen, onEdit, onPublish, onAdd, onDelete,
}: {
  index: number;
  total: number;
  event: ManagedEvent;
  onOrd: () => void;
  onReorder: (op: ReorderOp) => void;
  onOpen: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("event");
  const isFirst = index === 0;
  const isLast = index === total - 1;

  // Vertical reorder gutter (left): to-top / up / [position] / down / to-bottom.
  const gnav = "w-6 h-5 flex items-center justify-center text-text-dim hover:text-primary transition cursor-pointer disabled:opacity-25 disabled:hover:text-text-dim disabled:cursor-default";

  return (
    <div className={`flex gap-3 p-3 rounded-theme border ${event.status === "unpublished" ? "border-dashed border-border" : "border-border"} bg-surface-alt/40`}>
      {/* reorder gutter */}
      <div className="flex flex-col items-center shrink-0 self-stretch justify-center rounded-theme border border-border/60 bg-surface/40 px-0.5 py-1">
        <button onClick={() => onReorder("top")} disabled={isFirst} className={gnav} title={t("moveTop")}><Icons.ArrowUpToLine className="w-3.5 h-3.5" /></button>
        <button onClick={() => onReorder("up")} disabled={isFirst} className={gnav} title={t("moveUp")}><Icons.ChevronUp className="w-4 h-4" /></button>
        <button onClick={onOrd} title={t("positionTooltip")} className="w-6 h-5 font-theme-mono text-sm font-bold text-text-muted hover:text-primary transition cursor-pointer">{index + 1}</button>
        <button onClick={() => onReorder("down")} disabled={isLast} className={gnav} title={t("moveDown")}><Icons.ChevronDown className="w-4 h-4" /></button>
        <button onClick={() => onReorder("bottom")} disabled={isLast} className={gnav} title={t("moveBottom")}><Icons.ArrowDownToLine className="w-3.5 h-3.5" /></button>
      </div>

      {/* cover + content — clicking opens the detail modal (host's retract/viewers surface) */}
      <div
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="flex-1 min-w-0 flex gap-3 text-left cursor-pointer group"
      >
        <span className="w-14 h-14 rounded-theme shrink-0 border border-border overflow-hidden flex items-center justify-center bg-surface-alt relative">
          {event.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.images[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icons.Flag className="w-6 h-6 text-text-dim" />
          )}
          {event.images.length > 1 && (
            <span className="absolute right-0.5 bottom-0.5 text-[9px] font-theme-mono bg-black/55 text-white px-1 rounded">{event.images.length}</span>
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold group-hover:text-primary transition ${event.status === "unpublished" ? "text-text-muted" : "text-text"}`}>{event.title}</span>
            <StatusBadge status={event.status} knowerCount={event.status === "partial" ? event.knowers.length : undefined} />
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
            <EventTimeLabel payload={event.timePayload} />
          </div>
          {/* first line only, markdown-styled */}
          <EventBodyPreview content={event.description} lines={1} className="mt-1.5" />
        </div>
      </div>

      {/* fixed action column — same width on every row so cards stay aligned */}
      <div className="flex flex-col gap-1.5 shrink-0 self-start w-[104px]">
        {event.status === "unpublished" ? (
          <button onClick={onPublish} className="inline-flex items-center justify-center gap-1.5 h-8 rounded-theme bg-accent text-accent-foreground text-xs font-bold shadow-[var(--theme-glow)] hover:opacity-90 transition cursor-pointer">
            <Icons.Eye className="w-3.5 h-3.5" /> {t("publish")}
          </button>
        ) : event.status === "partial" ? (
          <button onClick={onAdd} className="inline-flex items-center justify-center gap-1.5 h-8 rounded-theme border border-warning/50 text-warning text-xs font-bold hover:bg-warning/10 transition cursor-pointer">
            <Icons.UserPlus className="w-3.5 h-3.5" /> {t("addViewers")}
          </button>
        ) : (
          <span className="inline-flex items-center justify-center gap-1.5 h-8 rounded-theme border border-success/45 bg-success/8 text-success text-xs font-bold">
            <Icons.CheckCheck className="w-3.5 h-3.5" /> {t("publishedBadge")}
          </span>
        )}
        <div className="flex gap-1.5">
          <button onClick={onEdit} title={t("edit")} className="flex-1 h-8 rounded-theme border border-border text-text-muted hover:text-text hover:border-text-muted flex items-center justify-center transition cursor-pointer"><Icons.Pencil className="w-4 h-4" /></button>
          <button onClick={onDelete} title={t("delete")} className="flex-1 h-8 rounded-theme border border-border text-text-muted hover:text-danger hover:border-danger/50 flex items-center justify-center transition cursor-pointer"><Icons.Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}
