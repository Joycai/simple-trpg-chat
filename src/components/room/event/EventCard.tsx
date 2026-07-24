"use client";

import { type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { composeTimelineLabel, dayPartFromDivider, type TimelineSegment } from "@/lib/messaging/timeline-payload";
import type { EventCardPayload } from "@/lib/story-events";
import { useEventData } from "./EventDataContext";
import { EventBodyPreview } from "./event-helpers";

/**
 * Time-pill tint by day-part — a bright warm morning, a warmer afternoon, and a
 * cool dark night, so the card's time reads at a glance. All theme tokens, so
 * every theme recolors automatically.
 */
const DAYPART_PILL: Record<TimelineSegment, string> = {
  morning:   "text-warning border-warning/40 bg-warning/15",
  afternoon: "text-primary border-primary/40 bg-primary/15",
  night:     "text-ai border-ai/40 bg-ai/15",
};

/**
 * Public-channel announcement card. The payload carries metadata only; the body
 * of an *unlocked* card is fetched per-viewer via the access-gated
 * `getEventForViewerAction`, so a locked card never receives content the viewer
 * isn't cleared for. Three faces: unlocked / locked / retracted.
 *
 * Layout follows the shrine design: a left icon gutter + a「事件志 EVENT」header
 * above a bordered card. All colors are semantic tokens — events own the accent
 * (gold) identity; the publish scope drives the status pill (full = success
 * green, partial = primary/vermilion).
 */
export function EventCard({
  payload,
  unlocked,
  roomId,
  onOpen,
}: {
  payload: EventCardPayload;
  unlocked: boolean;
  roomId?: number;
  onOpen: () => void;
}) {
  const t = useTranslations("event");
  const tl = useTranslations("timeline");
  const locale = useLocale();
  const timeLabel = payload.time ? composeTimelineLabel(payload.time, tl, locale) : "";

  if (payload.retracted) {
    return (
      <Shell tone="muted" icon={<Icons.Undo2 className="w-5 h-5" />} showTag={false}>
        <div className="rounded-theme border border-border bg-surface/50 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-theme shrink-0 flex items-center justify-center bg-surface-alt text-text-dim border border-border">
              <Icons.Undo2 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-text-dim line-through decoration-text-dim/50 truncate">{payload.title}</div>
              <div className="text-xs text-text-dim italic mt-1">{t("cardRetractedDesc")}</div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (!unlocked) {
    return (
      <Shell tone="muted" icon={<Icons.Lock className="w-5 h-5" />}>
        <div className="rounded-theme border border-dashed border-border bg-surface/50 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-theme shrink-0 flex items-center justify-center bg-surface-alt text-text-dim border border-border">
              <Icons.Lock className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              {/* Redacted title — the real title is never shown to a locked viewer. */}
              <span
                className="block h-3.5 w-28 max-w-full rounded-sm text-text-dim/60"
                style={{ backgroundImage: "repeating-linear-gradient(45deg, currentColor 0, currentColor 3px, transparent 3px, transparent 7px)" }}
                aria-hidden="true"
              />
              <div className="text-sm text-text-muted mt-2">{t("cardLockedDesc")}</div>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return <UnlockedCard payload={payload} roomId={roomId} timeLabel={timeLabel} onOpen={onOpen} />;
}

/** Unlocked card: reads the viewable body/images from the room-wide event data
 *  and renders the full design. Reading from the shared store (rather than one
 *  fetch per card) is both what keeps a long backlog to a single request and
 *  what lets a host's later edit reach a card already in the log. */
function UnlockedCard({
  payload,
  roomId,
  timeLabel,
  onOpen,
}: {
  payload: EventCardPayload;
  roomId?: number;
  timeLabel: string;
  onOpen: () => void;
}) {
  const t = useTranslations("event");
  const { eventsById, entities, loading } = useEventData();
  // undefined = still loading; null = unavailable (render metadata only).
  const found = eventsById.get(payload.eventId);
  const detail = found ?? (roomId && loading ? undefined : null);

  const isFull = payload.mode === "full";
  // Day-part tints the time pill (bright morning → warm afternoon → cool night),
  // all theme tokens; no usable time → neutral. The cover URL is known from the
  // payload at mount, so the image row is reserved before the fetch resolves.
  const dayPart = dayPartFromDivider(payload.time ?? null);
  const timePillClass = dayPart ? DAYPART_PILL[dayPart] : "text-text-muted border-border/60 bg-surface-alt/60";
  // Single cover thumbnail (first image) shown to the right of the body; the full
  // set lives in the detail modal. payload.cover is known at mount so the slot is
  // reserved before the fetch resolves.
  const cover = (detail && detail.images[0]) || payload.cover || null;

  return (
    <Shell tone="accent" icon={<Icons.Flag className="w-5 h-5" />}>
      {/* Fixed regions so the fetch fills in without resizing the card. */}
      <div className="rounded-theme border border-accent/35 bg-surface/70 shadow-[var(--theme-card-shadow)] overflow-hidden">
        <div className="px-4 py-3.5">
          {/* time pill + publish-scope status pill */}
          <div className="flex items-center gap-2 justify-between">
            {timeLabel ? (
              <span className={`inline-flex items-center gap-1.5 min-w-0 text-[11px] font-theme-mono rounded-full px-2 py-0.5 border ${timePillClass}`}>
                <Icons.Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{timeLabel}</span>
              </span>
            ) : <span />}
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
              isFull ? "text-success border-success/50" : "text-warning border-warning/50"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isFull ? "bg-success" : "bg-warning"}`} />
              {isFull ? t("statusFull") : t("statusPartial")}
            </span>
          </div>

          {/* title — single line, ellipsis. Prefer the live value: `payload.title`
              is a snapshot frozen into the card message at publish time, and
              editing an event does not repost the card. */}
          <h4 className="font-theme-display font-bold text-text text-base mt-2.5 truncate">{detail?.title ?? payload.title}</h4>

          {/* body (first 3 lines, markdown-styled) with the cover to its right.
              Fixed height so the fetch fills in without resizing; the body's
              min-w-0 lets its ellipsis truncate before it can reach the image. */}
          <div className="flex gap-3 mt-1.5 h-[4.5rem]">
            <div className="flex-1 min-w-0">
              {detail === undefined ? (
                <div className="space-y-2 pt-1" aria-hidden="true">
                  <div className="h-2.5 rounded bg-text-dim/15 animate-pulse w-11/12" />
                  <div className="h-2.5 rounded bg-text-dim/15 animate-pulse w-4/5" />
                  <div className="h-2.5 rounded bg-text-dim/15 animate-pulse w-3/5" />
                </div>
              ) : detail ? (
                <EventBodyPreview content={detail.description} lines={3} entities={entities} />
              ) : null}
            </div>
            {cover && (
              <button
                onClick={onOpen}
                className="shrink-0 w-[4.5rem] h-[4.5rem] rounded-theme border border-border overflow-hidden hover:border-accent/50 transition cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" className="w-full h-full object-cover" />
              </button>
            )}
          </div>
        </div>

        {/* footer — scope + view-details */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border/60 text-xs text-text-dim">
          <Icons.Eye className="w-3.5 h-3.5 shrink-0" />
          {isFull ? t("cardScopeFull") : t("cardScopePartial")}
          <button
            onClick={onOpen}
            className="ml-auto inline-flex items-center gap-1 text-accent font-bold hover:underline cursor-pointer"
          >
            {t("cardOpenPanel")}
            <Icons.ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * Shared frame: a left icon gutter + a「事件志 EVENT」header above the card body.
 * `tone` picks the icon/label palette (accent = gold for a live event, muted for
 * locked/retracted).
 */
function Shell({
  tone,
  icon,
  showTag = true,
  children,
}: {
  tone: "accent" | "muted";
  icon: ReactNode;
  showTag?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("event");
  const accent = tone === "accent";
  return (
    <div className="flex gap-3 w-full max-w-[560px]">
      <span className={`w-11 h-11 rounded-theme shrink-0 flex items-center justify-center border ${
        accent ? "bg-accent/12 text-accent border-accent/30" : "bg-surface-alt text-text-dim border-border"
      }`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-sm font-bold font-theme-display ${accent ? "text-text" : "text-text-muted"}`}>{t("cardLabel")}</span>
          {showTag && (
            <span className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded border ${
              accent ? "text-accent border-accent/40 bg-accent/10" : "text-text-dim border-border bg-surface-alt"
            }`}>
              {t("cardTag")}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
