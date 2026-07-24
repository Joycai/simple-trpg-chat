"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { MentionChip } from "@/components/room/notebook/notebook-helpers";
import { getEventForViewerAction, markEventViewedAction, retractEventAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel, useBackpackEntities, type EventPlayer } from "./event-helpers";
import { EventEditor } from "./EventEditor";
import { EventPublishDialog } from "./EventPublishDialog";

interface EventDetailModalProps {
  roomId: number;
  eventId: number;
  /** Host sees the visibility-control footer; players get that space as content. */
  isHost?: boolean;
  /** Non-host, non-bot members — for the publish / add-viewers dialogs. */
  players?: EventPlayer[];
  onClose: () => void;
  /** Fired after the event is marked read or mutated, so panels + badge refresh. */
  onViewed?: () => void;
}

/** Full-content event view in a centered modal. Fetches by id (access-gated),
 *  so it works from the events panel, the management panel, or a chat card.
 *  For the host it doubles as the control surface (edit / publish / retract). */
export function EventDetailModal({ roomId, eventId, isHost = false, players = [], onClose, onViewed }: EventDetailModalProps) {
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const entities = useBackpackEntities(roomId);
  const [event, setEvent] = useState<EventView | null | undefined>(undefined); // undefined = loading
  const [zoom, setZoom] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Host sub-flows layered over the modal.
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState<"publish" | "add" | null>(null);
  const [confirmRetract, setConfirmRetract] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const e = await getEventForViewerAction(roomId, eventId);
        if (alive) setEvent(e);
        if (e && !isHost) {
          markEventViewedAction(roomId, eventId).then(() => onViewed?.()).catch(() => {});
        }
      } catch {
        if (alive) setEvent(null);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, eventId, reload]);

  // After a host mutation: refetch this modal + signal the other panels/badge.
  const afterChange = () => { setReload((n) => n + 1); onViewed?.(); };

  const doRetract = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await retractEventAction(roomId, eventId);
      setConfirmRetract(false);
      afterChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : tCommon("error"));
    } finally {
      setBusy(false);
    }
  };

  const pubTime = event?.updatedAt
    ? new Date(event.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  const scope =
    event?.status === "full"
      ? { label: t("visScopeFull"), color: "text-success" }
      : event?.status === "partial"
        ? { label: t("visScopePartial", { count: event.knowers?.length ?? 0 }), color: "text-warning" }
        : { label: t("visScopeUnpublished"), color: "text-text-dim" };
  const published = event?.status === "partial" || event?.status === "full";

  return (
    <OverlayShell onClose={onClose} panelClassName="w-full max-w-lg mx-4 max-h-[85vh] bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          {/* header — event tag + host edit + close */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border shrink-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border border-accent/35 bg-accent/10 text-accent">
              <Icons.Flag className="w-3.5 h-3.5" /> {t("detailTag")}
            </span>
            <span className="ml-auto flex items-center gap-1">
              {isHost && event && (
                <button onClick={() => setEditing(true)} title={t("edit")} className="w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt flex items-center justify-center cursor-pointer transition">
                  <Icons.Pencil className="w-4 h-4" />
                </button>
              )}
              <button onClick={close} className="w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt flex items-center justify-center cursor-pointer transition"><Icons.X className="w-5 h-5" /></button>
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {event === undefined ? (
              <div className="flex items-center justify-center py-10 text-text-muted"><Icons.Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : event === null ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-dim">
                <Icons.Lock className="w-8 h-8 opacity-60" />
                <p className="text-sm">{t("detailUnavailable")}</p>
              </div>
            ) : (
              <>
                {/* title + time pill */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-text text-xl font-theme-display">{event.title}</h3>
                    {event.updated && (
                      <span className="text-[10px] font-bold font-theme-mono text-warning border border-warning/50 rounded px-1.5">{t("updated")}</span>
                    )}
                  </div>
                  {event.timePayload && (
                    <span className="shrink-0 inline-flex items-center rounded-full border border-accent/30 bg-accent/8 px-2.5 py-1 text-xs text-accent">
                      <EventTimeLabel payload={event.timePayload} />
                    </span>
                  )}
                </div>

                {/* images */}
                {event.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    {event.images.map((url) => (
                      <button key={url} onClick={() => setZoom(url)} className="aspect-[5/4] rounded-theme border border-border overflow-hidden hover:border-accent/50 transition cursor-pointer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {/* body */}
                <div className="mt-4">
                  {event.description.trim() ? (
                    <div className="notebook-note-body text-sm">
                      <MarkdownRenderer
                        content={event.description}
                        mentions={{ entities, render: (entity, key) => <MentionChip key={key} entity={entity} className="mx-0.5" /> }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-text-dim italic">{t("noContent")}</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* host-only visibility control footer */}
          {isHost && event && (
            <div className="border-t border-border px-5 py-4 shrink-0 bg-surface-alt/30">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${scope.color}`}>
                  <Icons.Eye className="w-3.5 h-3.5" /> {scope.label}
                </span>
                {published && pubTime && <span className="text-xs text-text-dim font-theme-mono">{t("publishedAt", { time: pubTime })}</span>}
              </div>
              {published ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setPublishing("add")}
                    disabled={event.status === "full"}
                    title={event.status === "full" ? t("visScopeFull") : t("viewers")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition disabled:opacity-40 disabled:cursor-default cursor-pointer"
                  >
                    <Icons.Users className="w-4 h-4" /> {t("viewers")}
                  </button>
                  <button
                    onClick={() => setConfirmRetract(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-theme border border-danger/50 text-danger text-sm font-bold hover:bg-danger/10 transition cursor-pointer"
                  >
                    <Icons.Undo2 className="w-4 h-4" /> {t("retractPublic")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPublishing("publish")}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-theme bg-accent text-accent-foreground text-sm font-bold shadow-[var(--theme-glow)] hover:opacity-90 transition cursor-pointer"
                >
                  <Icons.Eye className="w-4 h-4" /> {t("publish")}
                </button>
              )}
            </div>
          )}

          {/* Full-screen preview is portaled to <body> (escapes this modal's
              transformed subtree), has its own dark mask + close button. */}
          {zoom && <ImagePreview src={zoom} alt="" onClose={() => setZoom(null)} />}

          {/* host sub-flows */}
          {editing && event && (
            <EventEditor
              roomId={roomId}
              event={event}
              entities={entities}
              onClose={() => setEditing(false)}
              onSaved={afterChange}
            />
          )}
          {publishing && event && (
            <EventPublishDialog
              roomId={roomId}
              event={event}
              players={players}
              variant={publishing}
              knownIds={publishing === "add" ? (event.knowers?.map((k) => k.userId) ?? []) : []}
              onClose={() => setPublishing(null)}
              onDone={afterChange}
            />
          )}
          {confirmRetract && event && (
            <OverlayShell onClose={() => setConfirmRetract(false)} portal panelClassName="w-full max-w-sm mx-4 bg-surface theme-border rounded-theme shadow-2xl overflow-hidden">
              {(c) => (
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-11 h-11 rounded-theme shrink-0 flex items-center justify-center bg-danger/12 text-danger border border-danger/30">
                      <Icons.Undo2 className="w-5 h-5" />
                    </span>
                    <h4 className="font-bold text-text text-lg font-theme-display">{t("retractConfirmTitle")}</h4>
                  </div>
                  <p className="text-sm text-text-muted leading-6 mb-5">
                    {t.rich("retractConfirmBody", { title: event.title, b: (chunks) => <strong className="font-bold text-text">{chunks}</strong> })}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button onClick={c} className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer">{tCommon("cancel")}</button>
                    <button onClick={doRetract} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-theme bg-danger text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50 cursor-pointer">
                      {busy && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
                      {t("retractConfirmAction")}
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
