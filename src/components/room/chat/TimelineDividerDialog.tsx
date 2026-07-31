"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { insertTimelineDividerAction } from "@/app/actions/room";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import {
  composeTimelineLabel,
  type TimelineDividerData,
  type TimelineMode,
  type TimelineSegment,
  type TimelineTimeMode,
} from "@/lib/messaging/timeline-payload";

interface Props {
  roomId: number;
  onClose: () => void;
}

const SEGMENTS: { id: TimelineSegment; Icon: typeof Icons.Sunrise }[] = [
  { id: "morning", Icon: Icons.Sunrise },
  { id: "afternoon", Icon: Icons.Sun },
  { id: "night", Icon: Icons.Moon },
];

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function TimelineDividerDialog({ roomId, onClose }: Props) {
  const t = useTranslations("timeline");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onClose);

  const [mode, setMode] = useState<TimelineMode>("day");
  const [day, setDay] = useState(1);
  const [date, setDate] = useState(todayISO());
  const [custom, setCustom] = useState("");
  const [timeMode, setTimeMode] = useState<TimelineTimeMode>("segment");
  const [segment, setSegment] = useState<TimelineSegment>("afternoon");
  const [clock, setClock] = useState("12:00");
  const [submitting, setSubmitting] = useState(false);

  const isCustom = mode === "custom";

  // Live payload the preview + submit both read from. Every mode carries a
  // segment or clock tail (custom prepends its free text as the head).
  const data: TimelineDividerData = {
    mode,
    day: mode === "day" ? day : null,
    date: mode === "date" ? date : null,
    custom: isCustom ? custom : null,
    timeMode,
    segment: timeMode === "segment" ? segment : null,
    clock: timeMode === "clock" ? clock : null,
  };

  const previewLabel = composeTimelineLabel(data, t, locale);
  const canSubmit =
    !submitting &&
    !!previewLabel &&
    (mode === "day" ? day >= 1 : mode === "date" ? !!date : !!custom.trim()) &&
    (timeMode === "segment" ? !!segment : !!clock);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await insertTimelineDividerAction(roomId, data);
      if (res.success) close();
      else setSubmitting(false);
    } catch {
      setSubmitting(false);
    }
  };

  // Segmented tab (第几日 / 具体日期 and 时段/时间 toggle share this look).
  const tabBase = "flex-1 py-2 rounded-theme text-sm font-bold transition cursor-pointer text-center";
  const tabActive = "bg-accent text-accent-foreground shadow-[0_0_14px_rgb(var(--theme-accent)/0.35)]";
  const tabIdle = "text-text-muted hover:text-text";

  // Fixed h-12 on every field (and on the segment buttons) keeps each row the
  // same height across modes, so the dialog doesn't resize between tabs.
  const fieldCls =
    "w-full h-12 px-3.5 border border-input-border bg-input-bg rounded-theme text-text text-sm outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent placeholder:text-text-dim transition";

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        ref={panelRef} className={`bg-surface theme-border rounded-theme shadow-2xl p-6 w-full max-w-md ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <h3 className="flex items-center gap-2 font-bold text-xl text-text font-theme-display">
            <Icons.Sunrise className="w-5 h-5 text-accent" />
            {t("title")}
          </h3>
          <button
            onClick={close}
            aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Mode: 第几日 / 具体日期 / 自定义 */}
          <div className="flex gap-1 p-1 bg-input-bg border border-input-border rounded-theme">
            <button className={`${tabBase} ${mode === "day" ? tabActive : tabIdle}`} onClick={() => setMode("day")}>
              {t("tabDay")}
            </button>
            <button className={`${tabBase} ${mode === "date" ? tabActive : tabIdle}`} onClick={() => setMode("date")}>
              {t("tabDate")}
            </button>
            <button className={`${tabBase} ${mode === "custom" ? tabActive : tabIdle}`} onClick={() => setMode("custom")}>
              {t("tabCustom")}
            </button>
          </div>

          {/* Head field: day stepper / date input / free-text */}
          {mode === "day" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-text-muted">{t("dayLabel")}</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDay((d) => Math.max(1, d - 1))}
                  aria-label={t("dayMinus")}
                  className="w-12 h-12 shrink-0 flex items-center justify-center rounded-theme border border-input-border bg-input-bg text-text-muted hover:text-accent hover:border-accent/50 transition cursor-pointer"
                >
                  <Icons.Minus className="w-4 h-4" />
                </button>
                <div className="flex-1 h-12 flex items-center justify-center rounded-theme border border-accent/50 bg-accent/5 text-text font-bold font-theme-display">
                  {t("dayValue", { day })}
                </div>
                <button
                  onClick={() => setDay((d) => Math.min(999, d + 1))}
                  aria-label={t("dayPlus")}
                  className="w-12 h-12 shrink-0 flex items-center justify-center rounded-theme border border-input-border bg-input-bg text-text-muted hover:text-accent hover:border-accent/50 transition cursor-pointer"
                >
                  <Icons.Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : mode === "date" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-text-muted">{t("dateLabel")}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-text-muted">{t("customLabel")}</label>
              <input
                type="text"
                value={custom}
                maxLength={100}
                autoFocus
                placeholder={t("customPlaceholder")}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className={fieldCls}
              />
            </div>
          )}

          {/* Time section: segment buttons OR clock input, with a toggle link. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-text-muted">{timeMode === "segment" ? t("segmentLabel") : t("timeLabel")}</label>
              <button
                onClick={() => setTimeMode((m) => (m === "segment" ? "clock" : "segment"))}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline cursor-pointer"
              >
                {timeMode === "segment" ? <Icons.Clock className="w-3.5 h-3.5" /> : <Icons.Sunrise className="w-3.5 h-3.5" />}
                {timeMode === "segment" ? t("useClockTime") : t("useSegment")}
              </button>
            </div>
            {timeMode === "segment" ? (
              <div className="grid grid-cols-3 gap-2">
                {SEGMENTS.map(({ id, Icon }) => {
                  const sel = segment === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSegment(id)}
                      className={`flex items-center justify-center gap-1.5 h-12 rounded-theme border text-sm transition cursor-pointer ${
                        sel ? "border-accent bg-accent/10 text-accent font-bold" : "border-border bg-surface-alt/30 text-text-muted hover:bg-surface-alt"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t(`seg_${id}`)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} className={fieldCls} />
            )}
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-2 rounded-theme border border-dashed border-border p-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-dim">{t("preview")}</span>
            <div className="flex items-center justify-center gap-2 py-1">
              <span className="flex-1 h-px bg-gradient-to-r from-transparent to-accent/50" />
              <span className="inline-flex items-center gap-1.5 text-accent font-theme-display font-bold whitespace-nowrap">
                <Icons.Sunrise className="w-4 h-4" />
                {previewLabel || t("previewEmpty")}
              </span>
              <span className="flex-1 h-px bg-gradient-to-l from-transparent to-accent/50" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={close}
              className="px-5 py-3 rounded-theme font-bold text-sm text-text-muted border border-border hover:bg-surface-alt transition cursor-pointer"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-3 rounded-theme font-bold text-sm bg-gradient-to-b from-accent to-accent/80 text-accent-foreground shadow-[0_0_18px_rgb(var(--theme-accent)/0.4)] transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:shadow-none"
            >
              {t("insert")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
