"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { MentionChip } from "@/components/room/notebook/notebook-helpers";
import { getMyEventsAction, markEventsViewedAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel, useBackpackEntities } from "./event-helpers";

interface EventPanelProps {
  roomId: number;
  refreshKey: number;
  /** Scroll to / highlight this event on open (from a chat card "view" click). */
  focusEventId?: number | null;
  onClose: () => void;
  /** Clears the top-bar unread badge after we mark viewed. */
  onChanged: () => void;
}

export function EventPanel({ roomId, refreshKey, focusEventId, onClose, onChanged }: EventPanelProps) {
  const t = useTranslations("event");
  const entities = useBackpackEntities(roomId, refreshKey);
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const rows = await getMyEventsAction(roomId);
        if (alive) setEvents(rows);
      } catch { /* keep empty */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [roomId, refreshKey]);

  // Mark read once per open; refresh the badge afterwards.
  useEffect(() => {
    markEventsViewedAction(roomId).then(() => onChanged()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (focusEventId == null || loading) return;
    const el = document.getElementById(`event-card-${focusEventId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusEventId, loading, events]);

  return (
    <OverlayShell onClose={onClose} variant="drawer" panelClassName="w-full max-w-xl h-full bg-surface theme-border border-l border-border shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
            <Icons.ScrollText className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-text text-lg font-theme-display flex-1">{t("myEvents")}</h3>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-text-muted"><Icons.Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-text-dim">
                <Icons.ScrollText className="w-10 h-10 opacity-50" />
                <p className="text-sm">{t("emptyMine")}</p>
              </div>
            ) : (
              events.map((e) => (
                <article
                  key={e.id}
                  id={`event-card-${e.id}`}
                  className="rounded-theme border border-primary/30 bg-surface/70 overflow-hidden shadow-[var(--theme-card-shadow)]"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-transparent">
                    <Icons.ScrollText className="w-4 h-4 text-primary shrink-0" />
                    <EventTimeLabel payload={e.timePayload} className="text-xs text-text-muted ml-auto" />
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h4 className="font-bold text-text text-lg font-theme-display">{e.title}</h4>
                      {e.updated && (
                        <span className="text-[10px] font-bold font-theme-mono text-warning border border-warning/50 rounded px-1.5">{t("updated")}</span>
                      )}
                    </div>
                    {e.description.trim() ? (
                      <div className="notebook-note-body text-sm">
                        <MarkdownRenderer
                          content={e.description}
                          mentions={{ entities, render: (entity, key) => <MentionChip key={key} entity={entity} className="mx-0.5" /> }}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-text-dim italic">{t("noContent")}</p>
                    )}
                    {e.images.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {e.images.map((url) => (
                          <button key={url} onClick={() => setZoom(url)} className="w-24 h-20 rounded-theme border border-border overflow-hidden hover:border-primary/50 transition cursor-pointer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))
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
