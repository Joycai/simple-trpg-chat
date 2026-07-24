"use client";

import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { composeTimelineLabel } from "@/lib/messaging/timeline-payload";
import type { EventCardPayload } from "@/lib/story-events";

/**
 * Public-channel announcement card. Carries only metadata; the body is read in
 * the event panel. Three faces: retracted / unlocked (viewer may read) / locked.
 */
export function EventCard({
  payload,
  unlocked,
  onOpen,
}: {
  payload: EventCardPayload;
  unlocked: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("event");
  const tl = useTranslations("timeline");
  const locale = useLocale();
  const timeLabel = payload.time ? composeTimelineLabel(payload.time, tl, locale) : "";

  if (payload.retracted) {
    return (
      <div className="max-w-[420px] rounded-theme border border-danger/35 bg-surface/70 overflow-hidden opacity-90">
        <div className="flex items-center gap-2 px-3.5 py-2 border-b border-danger/25 bg-gradient-to-r from-danger/10 to-transparent text-danger text-xs font-bold">
          <Icons.Undo2 className="w-4 h-4" /> {t("cardRetracted")}
          {timeLabel && <span className="ml-auto font-theme-mono text-text-muted font-medium">{timeLabel}</span>}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="w-10 h-10 rounded-theme shrink-0 flex items-center justify-center bg-danger/12 text-danger border border-danger/30"><Icons.Undo2 className="w-5 h-5" /></span>
          <div>
            <div className="font-bold text-text-muted line-through decoration-danger/60">{payload.title}</div>
            <div className="text-xs text-text-dim italic mt-0.5">{t("cardRetractedDesc")}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="max-w-[420px] rounded-theme border border-border bg-surface/70 overflow-hidden shadow-[var(--theme-card-shadow)]">
        <div className="flex items-center gap-2 px-3.5 py-2 border-b border-warning/25 bg-gradient-to-r from-warning/12 to-transparent text-warning text-xs font-bold">
          <Icons.Lock className="w-4 h-4" /> {t("cardLimited")}
          {timeLabel && <span className="ml-auto font-theme-mono text-text-muted font-medium">{timeLabel}</span>}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="w-10 h-10 rounded-theme shrink-0 flex items-center justify-center bg-warning/12 text-warning border border-warning/30"><Icons.Lock className="w-5 h-5" /></span>
          <div>
            <div className="font-bold text-text">{payload.title}</div>
            <div className="text-xs text-text-dim italic mt-0.5">{t("cardLockedDesc")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[440px] rounded-theme border border-primary/40 bg-surface/70 overflow-hidden shadow-[var(--theme-card-shadow)]">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-primary/25 bg-gradient-to-r from-primary/14 to-transparent text-primary text-xs font-bold">
        <Icons.ScrollText className="w-4 h-4" /> {t("cardPublished")}
        {timeLabel && <span className="ml-auto font-theme-mono text-text-muted font-medium">{timeLabel}</span>}
      </div>
      <div className="px-4 py-3">
        <div className="font-bold text-text text-base mb-1">{payload.title}</div>
        {payload.cover && (
          <div className="mt-2 rounded-theme overflow-hidden border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payload.cover} alt="" className="w-full max-h-40 object-cover" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border text-xs text-text-muted">
        <Icons.Eye className="w-3.5 h-3.5" /> {t("cardCanView")}
        <button onClick={onOpen} className="ml-auto inline-flex items-center gap-1.5 text-primary font-bold hover:underline cursor-pointer">
          <Icons.ScrollText className="w-3.5 h-3.5" /> {t("cardOpenPanel")}
        </button>
      </div>
    </div>
  );
}
