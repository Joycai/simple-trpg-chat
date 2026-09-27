"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getMyEventsAction, getUnreadEventCountAction, type EventView } from "@/app/actions/event";
import type { EventData } from "@/components/room/event/EventDataContext";
import { useBackpackEntities } from "@/components/room/hooks/useBackpackEntities";

/** The two lookups the event list feeds (detail modal by id, chat-card lock state). */
function indexEvents(rows: EventView[]) {
  return {
    byId: new Map(rows.map((e) => [e.id, e])),
    visibleIds: new Set(rows.map((e) => e.id)),
  };
}

/**
 * The room's story events for this viewer: the list behind EventDataContext,
 * the readable-id set that unlocks chat cards, the top-bar unread badge, and
 * which event's detail modal is open. Seeded from the server render; the
 * `events_updated` SSE bumps `eventsRefreshKey` through `setEventsRefreshKey`.
 */
export function useRoomEventsData({
  roomId,
  initialEvents,
  initialUnreadEvents,
  inventoryRefreshKey,
}: {
  roomId: number;
  initialEvents: EventView[];
  initialUnreadEvents: number;
  /** Re-reads the backpack entities that `@` links in event bodies resolve against. */
  inventoryRefreshKey: number;
}) {
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);
  const [visibleEventIds, setVisibleEventIds] = useState(() => indexEvents(initialEvents).visibleIds);
  const [eventsById, setEventsById] = useState(() => indexEvents(initialEvents).byId);
  const [eventsOrdered, setEventsOrdered] = useState<EventView[]>(initialEvents);
  const [eventsError, setEventsError] = useState(false);
  const [unreadEvents, setUnreadEvents] = useState(initialUnreadEvents);
  const [unreadEventsKey, setUnreadEventsKey] = useState(0);
  const [eventDetailId, setEventDetailId] = useState<number | null>(null);
  // Passed into every ChatMessage — must stay referentially stable.
  const handleOpenEvent = useCallback((id: number) => setEventDetailId(id), []);

  // Events: one fetch for the whole room, shared through EventDataContext with
  // the chat cards, the events panel and the detail modal — see that file for
  // why this is centralized. The same response drives the readable-id set that
  // gates each chat card's lock state, plus the top-bar unread badge.
  // Re-fetched on the shared eventsRefreshKey, which the `events_updated` SSE
  // bumps, so publish/retract/promote/edit all reflect live. The first list
  // comes with the server render (initialSnapshot), so key 0 skips the fetch.
  useEffect(() => {
    if (eventsRefreshKey === 0) return;
    let alive = true;
    void (async () => {
      try {
        const rows = await getMyEventsAction(roomId);
        if (!alive) return;
        const { byId, visibleIds } = indexEvents(rows);
        setEventsOrdered(rows);
        setEventsById(byId);
        setVisibleEventIds(visibleIds);
        setEventsError(false);
      } catch {
        // A failed refresh keeps the current list on screen (and its "updated"
        // highlights); consumers only show the error when there is no list.
        if (alive) setEventsError(true);
      }
    })();
    return () => { alive = false; };
  }, [roomId, eventsRefreshKey]);

  useEffect(() => {
    if (eventsRefreshKey === 0 && unreadEventsKey === 0) return;
    getUnreadEventCountAction(roomId).then(setUnreadEvents).catch(() => {});
  }, [roomId, eventsRefreshKey, unreadEventsKey]);

  const bumpEvents = useCallback(() => setEventsRefreshKey((k) => k + 1), []);
  /** Refresh only the top-bar badge. Marking events read must NOT re-fetch the
   *  list — that is what used to erase the "已更新" highlights ~300ms after the
   *  player opened the panel to look at them. */
  const refreshEventBadge = useCallback(() => setUnreadEventsKey((k) => k + 1), []);

  const eventEntities = useBackpackEntities(roomId, inventoryRefreshKey);
  const eventData = useMemo<EventData>(() => ({
    eventsById, eventsOrdered, entities: eventEntities,
    error: eventsError, retry: bumpEvents,
  }), [eventsById, eventsOrdered, eventEntities, eventsError, bumpEvents]);

  return {
    eventsRefreshKey, setEventsRefreshKey,
    visibleEventIds, unreadEvents,
    eventDetailId, setEventDetailId, handleOpenEvent,
    bumpEvents, refreshEventBadge, eventData,
  };
}
