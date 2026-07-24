"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Icons } from "@/components/shared/icons";
import {
  composeTimelineLabel,
  parseTimelinePayload,
  type TimelineDividerData,
  type TimelineMode,
  type TimelineSegment,
  type TimelineTimeMode,
} from "@/lib/messaging/timeline-payload";

const SEGMENTS: { key: TimelineSegment; Icon: (typeof Icons)[keyof typeof Icons] }[] = [
  { key: "morning", Icon: Icons.Sunrise },
  { key: "afternoon", Icon: Icons.Sun },
  { key: "night", Icon: Icons.Moon },
];

/**
 * Optional in-game time selector for an event, reusing the timeline divider's
 * two-axis model (date axis: 第N日 / calendar / free text; time axis: segment
 * or HH:MM clock). Emits a `TimelineDividerData` (or null when disabled).
 */
export function EventTimePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (payload: string | null) => void;
}) {
  const t = useTranslations("timeline");
  const te = useTranslations("event");
  const locale = useLocale();

  const initial = parseTimelinePayload(value);
  const [enabled, setEnabled] = useState(!!initial);
  const [data, setData] = useState<TimelineDividerData>(
    initial ?? { mode: "day", day: 1, timeMode: "segment", segment: "afternoon" },
  );

  const emit = (next: TimelineDividerData, on: boolean) => {
    onChange(on ? JSON.stringify({ timelineDivider: next }) : null);
  };
  const patch = (p: Partial<TimelineDividerData>) => {
    const next = { ...data, ...p };
    setData(next);
    emit(next, enabled);
  };
  const toggle = (on: boolean) => {
    setEnabled(on);
    emit(data, on);
  };

  const modeBtn = (m: TimelineMode, label: string) => (
    <button
      type="button"
      onClick={() => patch({ mode: m })}
      className={`px-3 py-1.5 rounded-theme text-xs font-bold transition cursor-pointer ${
        data.mode === m ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
  const timeModeBtn = (m: TimelineTimeMode, label: string) => (
    <button
      type="button"
      onClick={() => patch({ timeMode: m })}
      className={`px-3 py-1.5 rounded-theme text-xs font-bold transition cursor-pointer ${
        data.timeMode === m ? "bg-primary/15 text-primary" : "text-text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );

  const previewLabel = composeTimelineLabel(data, t, locale);

  return (
    <div className="rounded-theme border border-border bg-surface-alt/40 p-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="accent-[rgb(var(--theme-primary))] w-4 h-4"
        />
        <span className="text-xs font-bold text-text">{te("timeEnable")}</span>
      </label>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Date axis */}
          <div className="inline-flex flex-wrap gap-1 rounded-theme border border-border bg-input-bg p-1 w-fit">
            {modeBtn("day", t("tabDay"))}
            {modeBtn("date", t("tabDate"))}
            {modeBtn("custom", t("tabCustom"))}
          </div>

          {data.mode === "day" && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => patch({ day: Math.max(1, (data.day ?? 1) - 1) })} className="w-8 h-8 rounded-theme border border-border text-text-muted hover:text-text cursor-pointer">−</button>
              <input
                type="number"
                min={1}
                value={data.day ?? 1}
                onChange={(e) => patch({ day: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                className="w-20 text-center bg-input-bg border border-input-border rounded-theme px-2 py-1.5 text-sm text-text font-theme-mono outline-none focus:border-primary"
              />
              <button type="button" onClick={() => patch({ day: (data.day ?? 1) + 1 })} className="w-8 h-8 rounded-theme border border-border text-text-muted hover:text-text cursor-pointer">+</button>
            </div>
          )}
          {data.mode === "date" && (
            <input
              type="date"
              value={data.date ?? ""}
              onChange={(e) => patch({ date: e.target.value })}
              className="bg-input-bg border border-input-border rounded-theme px-3 py-1.5 text-sm text-text font-theme-mono outline-none focus:border-primary w-fit"
            />
          )}
          {data.mode === "custom" && (
            <input
              type="text"
              value={data.custom ?? ""}
              onChange={(e) => patch({ custom: e.target.value })}
              placeholder={te("timeCustomPlaceholder")}
              className="bg-input-bg border border-input-border rounded-theme px-3 py-1.5 text-sm text-text outline-none focus:border-primary"
            />
          )}

          {/* Time-of-day axis (not shown for free-text custom) */}
          {data.mode !== "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex gap-1 rounded-theme border border-border bg-input-bg p-1">
                {timeModeBtn("segment", te("timeSegment"))}
                {timeModeBtn("clock", te("timeClock"))}
              </div>
              {data.timeMode === "segment" ? (
                <div className="inline-flex gap-1">
                  {SEGMENTS.map(({ key, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => patch({ segment: key })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-theme border text-xs font-bold transition cursor-pointer ${
                        data.segment === key ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-text-muted hover:text-text"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t(key === "morning" ? "segMorning" : key === "afternoon" ? "segAfternoon" : "segNight")}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="time"
                  value={data.clock ?? ""}
                  onChange={(e) => patch({ clock: e.target.value })}
                  className="bg-input-bg border border-input-border rounded-theme px-3 py-1.5 text-sm text-text font-theme-mono outline-none focus:border-primary w-fit"
                />
              )}
            </div>
          )}

          {previewLabel && (
            <div className="text-xs text-text-muted">
              {te("timePreviewLabel")}<span className="font-theme-mono text-primary">{previewLabel}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
