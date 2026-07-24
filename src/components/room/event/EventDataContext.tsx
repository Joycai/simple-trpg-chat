"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EventView } from "@/app/actions/event";
import type { NotebookLinkEntity } from "@/lib/notebook";

/**
 * Room-wide event data, fetched once by `RoomClient` and shared with every
 * consumer: the chat cards, the events panel, and the detail modal.
 *
 * Before this existed each `event-card` message in the chat log fetched its own
 * copy of the event *and* the whole backpack, so a room with 20 published
 * events issued 40 server actions on load — and, because those fetches keyed on
 * the event id alone, a card never picked up a host's later edits.
 *
 * `getMyEventsAction` already returns exactly what a card needs (title, body,
 * images, status) and is already access-filtered server-side, so one call
 * serves everyone. It re-runs on the shared `eventsRefreshKey`, which the
 * `events_updated` SSE bumps — that is what makes edits show up live.
 *
 * Note this carries *content*, never the lock decision: whether a chat card is
 * unlocked stays with `visibleEventIds` on the message row, keeping "may I see
 * it" separate from "what is it".
 */
export interface EventData {
  /** Content by event id — the card/detail lookup. */
  eventsById: Map<number, EventView>;
  /** Same rows in server order (player: newest acquisition first; host: authored). */
  eventsOrdered: EventView[];
  /** The viewer's backpack as `@`-mention targets, fetched once for the room. */
  entities: NotebookLinkEntity[];
  /** True only until the first fetch settles — refreshes keep the old list visible. */
  loading: boolean;
  /** The last fetch failed; consumers show an error state instead of "no events". */
  error: boolean;
  /** Re-run the fetch (also the panels' retry button). */
  retry: () => void;
}

/** Inert default so a consumer rendered outside the provider degrades to
 *  metadata-only instead of throwing (mirrors `EventCard`'s no-roomId path). */
const EMPTY: EventData = {
  eventsById: new Map(),
  eventsOrdered: [],
  entities: [],
  loading: false,
  error: false,
  retry: () => {},
};

const EventDataContext = createContext<EventData | null>(null);

export function EventDataProvider({ value, children }: { value: EventData; children: ReactNode }) {
  return <EventDataContext.Provider value={value}>{children}</EventDataContext.Provider>;
}

export function useEventData(): EventData {
  return useContext(EventDataContext) ?? EMPTY;
}
