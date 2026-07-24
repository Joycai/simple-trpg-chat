"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { stripMarkdown } from "@/lib/notebook";
import { getMyEventsAction, markEventsViewedAction, type EventView } from "@/app/actions/event";
import { EventTimeLabel } from "./event-helpers";

interface EventPanelProps {
  roomId: number;
  refreshKey: number;
  onClose: () => void;
  /** Clears the top-bar unread badge after we mark viewed. */
  onChanged: () => void;
  /** Opens an event's detail modal — rendered at the room's top level (centered),
   *  NOT inside this drawer, so a transformed drawer ancestor can't trap it. */
  onOpenEvent: (eventId: number) => void;
}

export function EventPanel({ roomId, refreshKey, onClose, onChanged, onOpenEvent }: EventPanelProps) {
  const t = useTranslations("event");
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);

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
            <Icons.Flag className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-text text-lg font-theme-display flex-1">{t("logTitle")}</h3>
            <button onClick={close} className="text-text-muted hover:text-text cursor-pointer"><Icons.X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-text-muted"><Icons.Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-text-dim">
                <Icons.Flag className="w-10 h-10 opacity-50" />
                <p className="text-sm">{t("emptyMine")}</p>
              </div>
            ) : (
              // Timeline: a single rail down the left, one node per event, cards ordered
              // by acquisition time (newest first — server-sorted for the player view).
              <div className="relative flex flex-col gap-3">
                <span aria-hidden className="absolute left-[5px] top-3 bottom-3 w-px bg-border/70" />
                {events.map((e) => (
                  <div key={e.id} className="relative flex gap-4">
                    <span className="relative z-10 mt-4 shrink-0">
                      <span className={`block w-[11px] h-[11px] rounded-full border-2 ${e.updated ? "bg-warning border-warning shadow-[var(--theme-glow)]" : "bg-surface border-border"}`} />
                    </span>
                    <EventLogCard event={e} onOpen={() => onOpenEvent(e.id)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {!loading && events.length > 0 && (
            <div className="px-5 py-3 border-t border-border/60 shrink-0 text-center text-xs text-text-dim">
              {t("logFooter", { count: events.length })}
            </div>
          )}
        </>
      )}
    </OverlayShell>
  );
}

/** Timeline entry — time header, title, one-line preview; flags updates + limited scope. */
function EventLogCard({ event, onOpen }: { event: EventView; onOpen: () => void }) {
  const t = useTranslations("event");
  const preview = useMemo(() => stripMarkdown(event.description).slice(0, 90), [event.description]);
  return (
    <button
      onClick={onOpen}
      className={`flex-1 min-w-0 text-left rounded-theme border p-3.5 transition cursor-pointer ${
        event.updated
          ? "border-warning/45 bg-warning/[0.06] hover:border-warning/70"
          : "border-border bg-surface/50 hover:border-primary/40 hover:bg-surface-alt/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <EventTimeLabel payload={event.timePayload} className="text-xs text-text-muted" />
        <span className="flex items-center gap-2 shrink-0">
          {event.status === "partial" && (
            <span className="text-[10px] font-bold text-warning border border-warning/45 rounded-full px-2 py-0.5">{t("onlyYou")}</span>
          )}
          {event.updated && <span className="w-2 h-2 rounded-full bg-warning shadow-[var(--theme-glow)]" />}
        </span>
      </div>
      <h4 className="font-theme-display font-bold text-text mt-1.5 truncate">{event.title}</h4>
      {preview && <p className="mt-1 text-xs text-text-muted truncate">{preview}</p>}
    </button>
  );
}
