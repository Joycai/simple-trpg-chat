"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { stripMarkdown } from "@/lib/notebook";
import { getMyEventsAction, markEventsViewedAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel } from "./event-helpers";
import { EventDetailModal } from "./EventDetailModal";

interface EventPanelProps {
  roomId: number;
  refreshKey: number;
  /** Open this event's detail modal on mount (from a chat card "view" click). */
  focusEventId?: number | null;
  onClose: () => void;
  /** Clears the top-bar unread badge after we mark viewed. */
  onChanged: () => void;
}

export function EventPanel({ roomId, refreshKey, focusEventId, onClose, onChanged }: EventPanelProps) {
  const t = useTranslations("event");
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(focusEventId ?? null);

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

  return (
    <OverlayShell onClose={onClose} variant="drawer" panelClassName="w-full max-w-xl h-full bg-surface theme-border border-l border-border shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border shrink-0">
            <Icons.ScrollText className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-text text-lg font-theme-display flex-1">{t("myEvents")}</h3>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2.5">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-text-muted"><Icons.Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-text-dim">
                <Icons.ScrollText className="w-10 h-10 opacity-50" />
                <p className="text-sm">{t("emptyMine")}</p>
              </div>
            ) : (
              events.map((e) => <EventListCard key={e.id} event={e} onOpen={() => setDetailId(e.id)} />)
            )}
          </div>

          {detailId != null && (
            <EventDetailModal roomId={roomId} eventId={detailId} onClose={() => setDetailId(null)} onViewed={onChanged} />
          )}
        </>
      )}
    </OverlayShell>
  );
}

/** Fixed-height summary card — cover/icon, title, time, one-line preview. */
function EventListCard({ event, onOpen }: { event: EventView; onOpen: () => void }) {
  const t = useTranslations("event");
  const preview = useMemo(() => stripMarkdown(event.description).slice(0, 90), [event.description]);
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 rounded-theme border border-primary/25 bg-surface/60 hover:border-primary/50 hover:bg-surface-alt/60 transition cursor-pointer"
    >
      <div className="w-12 h-12 rounded-theme shrink-0 border border-border overflow-hidden flex items-center justify-center bg-surface-alt">
        {event.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.images[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <Icons.ScrollText className="w-5 h-5 text-primary/70" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-text truncate">{event.title}</span>
          {event.updated && (
            <span className="text-[10px] font-bold font-theme-mono text-warning border border-warning/50 rounded px-1 shrink-0">{t("updated")}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-text-muted">
          <EventTimeLabel payload={event.timePayload} />
          {preview && <span className="truncate">{preview}</span>}
        </div>
      </div>
      <Icons.ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
    </button>
  );
}
