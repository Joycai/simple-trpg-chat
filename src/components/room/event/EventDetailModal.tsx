"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { MentionChip } from "@/components/room/notebook/notebook-helpers";
import { getEventForViewerAction, markEventViewedAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel, useBackpackEntities } from "./event-helpers";

interface EventDetailModalProps {
  roomId: number;
  eventId: number;
  onClose: () => void;
  /** Fired after the event is marked read, so the unread badge refreshes. */
  onViewed?: () => void;
}

/** Full-content event view in a centered modal. Fetches by id (access-gated),
 *  so it works both from the events panel and from a chat card. */
export function EventDetailModal({ roomId, eventId, onClose, onViewed }: EventDetailModalProps) {
  const t = useTranslations("event");
  const entities = useBackpackEntities(roomId);
  const [event, setEvent] = useState<EventView | null | undefined>(undefined); // undefined = loading
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const e = await getEventForViewerAction(roomId, eventId);
        if (alive) setEvent(e);
        if (e) {
          markEventViewedAction(roomId, eventId).then(() => onViewed?.()).catch(() => {});
        }
      } catch {
        if (alive) setEvent(null);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, eventId]);

  return (
    <OverlayShell onClose={onClose} panelClassName="w-full max-w-lg mx-4 max-h-[85vh] bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-primary/25 bg-gradient-to-r from-primary/12 to-transparent shrink-0">
            <Icons.ScrollText className="w-4 h-4 text-primary shrink-0" />
            <EventTimeLabel payload={event?.timePayload ?? null} className="text-xs text-text-muted" />
            <button onClick={close} className="ml-auto text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
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
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h3 className="font-bold text-text text-xl font-theme-display">{event.title}</h3>
                  {event.updated && (
                    <span className="text-[10px] font-bold font-theme-mono text-warning border border-warning/50 rounded px-1.5">{t("updated")}</span>
                  )}
                </div>
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
                {event.images.length > 0 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {event.images.map((url) => (
                      <button key={url} onClick={() => setZoom(url)} className="w-28 h-24 rounded-theme border border-border overflow-hidden hover:border-primary/50 transition cursor-pointer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {zoom && (
            <OverlayShell onClose={() => setZoom(null)} panelClassName="max-w-[92vw] max-h-[88vh]">
              {() => (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={zoom} alt="" className="max-w-full max-h-[88vh] rounded-theme object-contain" />
              )}
            </OverlayShell>
          )}
        </>
      )}
    </OverlayShell>
  );
}
