/**
 * Pure helpers for the story-events module (事件). Dependency-free (no React, no
 * DB) so both server actions and client components can import them, and so the
 * visibility / payload logic is unit-testable in isolation.
 *
 * See docs/design/event-module.md. The event body is NEVER carried in the
 * public-channel card payload — only the metadata below — so a locked card
 * leaks nothing about content the viewer isn't cleared for.
 */
import type { EventStatus } from "@/db/schema";
import type { TimelineDividerData } from "@/lib/messaging/timeline-payload";

/** Max images per event (first is the cover). */
export const MAX_EVENT_IMAGES = 3;

/** Length caps, mirroring the notebook's NOTE_TITLE_MAX / NOTE_CONTENT_MAX.
 *  Events had none, so a paste of arbitrary size went straight to the DB — and
 *  the body now rides in the room-wide event fetch, where size is shared cost. */
export const EVENT_TITLE_MAX = 100;
export const EVENT_DESC_MAX = 20_000;

/**
 * Structured payload stored in `messages.diceDetail` for a `systemKind:
 * 'event-card'` message — the public-channel announcement. Metadata only.
 */
export interface EventCardPayload {
  eventId: number;
  title: string;
  /** Publish mode at broadcast time — full = everyone unlocked; partial = per-viewer. */
  mode: "partial" | "full";
  /** Optional in-game time (reuses the timeline divider model), for the card header. */
  time?: TimelineDividerData | null;
  /** Cover image URL (first image), shown on the *unlocked* card only. */
  cover?: string | null;
  /** Set when the host retracts the event — the card renders a "已撤回" state. */
  retracted?: boolean;
}

/** Payload for a `systemKind: 'event-receipt'` pill (a personal "new event" ping). */
export interface EventReceiptPayload {
  eventId: number;
  title: string;
}

export function buildEventCardPayload(p: EventCardPayload): string {
  return JSON.stringify({ eventCard: p });
}

export function parseEventCardPayload(raw: string | null | undefined): EventCardPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { eventCard?: EventCardPayload };
    const c = parsed?.eventCard;
    if (!c || typeof c.eventId !== "number" || typeof c.title !== "string") return null;
    return c;
  } catch {
    return null;
  }
}

export function buildEventReceiptPayload(p: EventReceiptPayload): string {
  return JSON.stringify({ eventReceipt: p });
}

export function parseEventReceiptPayload(raw: string | null | undefined): EventReceiptPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { eventReceipt?: EventReceiptPayload };
    const r = parsed?.eventReceipt;
    if (!r || typeof r.eventId !== "number" || typeof r.title !== "string") return null;
    return r;
  } catch {
    return null;
  }
}

/**
 * Whether a viewer may read an event's full content.
 *  - host/creator: always (even while unpublished).
 *  - unpublished: nobody else.
 *  - full: any room member (caller guarantees the viewer is a member).
 *  - partial: only enumerated members (`isVisibleMember`).
 */
export function canViewEvent(args: {
  status: EventStatus;
  isHostOrCreator: boolean;
  isVisibleMember: boolean;
}): boolean {
  if (args.isHostOrCreator) return true;
  switch (args.status) {
    case "unpublished":
      return false;
    case "full":
      return true;
    case "partial":
      return args.isVisibleMember;
    default:
      return false;
  }
}

/**
 * The access decision behind `getEventForViewerAction` — the call that actually
 * hands an event's body to a client. `canViewEvent` covers the same ground for
 * the list query, but this is the single-event path, and it had no test.
 *
 * `hasVisibilityRow` means the viewer has a row for this event. It grants
 * nothing on its own: an `unpublished` event stays invisible to a non-host even
 * with a row present, which matters because a row can outlive a publish if
 * cleanup ever misses one.
 */
export function resolveEventVisibility(args: {
  status: EventStatus;
  isHost: boolean;
  hasVisibilityRow: boolean;
}): { visible: boolean; exposeHostFields: boolean } {
  const { status, isHost, hasVisibilityRow } = args;
  if (isHost) return { visible: true, exposeHostFields: true };
  const visible = status === "full" || (status === "partial" && hasVisibilityRow);
  return { visible, exposeHostFields: false };
}

/** True once an event has been published in any form (i.e. a public card exists). */
export function isPublished(status: EventStatus): boolean {
  return status === "partial" || status === "full";
}

/**
 * Parse/normalize the stored image array: tolerate malformed JSON, keep only
 * non-empty strings, and clamp to MAX_EVENT_IMAGES.
 */
export function parseEventImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, MAX_EVENT_IMAGES);
  } catch {
    return [];
  }
}

/** Serialize an image URL list for storage (clamped, de-blanked). */
export function serializeEventImages(urls: string[]): string {
  return JSON.stringify(urls.filter((u) => typeof u === "string" && u.length > 0).slice(0, MAX_EVENT_IMAGES));
}
