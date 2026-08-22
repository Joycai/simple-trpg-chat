"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Users, TrendingUp, Eye, BarChart2 } from "lucide-react";

export type StatsRange = "day" | "week" | "month" | "3month" | "year";

export interface StatsData {
  liveOnlineCount: number;
  today: { visitCount: number; peakOnline: number };
  series: { label: string; visitCount: number; peakOnline: number }[];
}

interface TrafficStatsSectionProps {
  statsData: StatsData | null;
  range: StatsRange;
  onRangeChange: (r: StatsRange) => void;
}

export function TrafficStatsSection({ statsData, range, onRangeChange }: TrafficStatsSectionProps) {
  const t = useTranslations("admin");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // SVG Chart Calculations
  const points = statsData?.series || [];
  const width = 600;
  const height = 240;
  const paddingLeft = 50;
  const paddingRight = 50;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVisits = Math.max(...points.map((p) => p.visitCount), 5);
  const maxPeak = Math.max(...points.map((p) => p.peakOnline), 5);

  const roundUpMax = (val: number) => {
    if (val <= 5) return 5;
    if (val <= 10) return 10;
    if (val <= 50) return Math.ceil(val / 10) * 10;
    if (val <= 100) return Math.ceil(val / 20) * 20;
    if (val <= 500) return Math.ceil(val / 50) * 50;
    if (val <= 1000) return Math.ceil(val / 100) * 100;
    return Math.ceil(val / 500) * 500;
  };

  const leftMax = roundUpMax(maxVisits);
  const rightMax = roundUpMax(maxPeak);

  const getCoords = (i: number, visit: number, peak: number) => {
    if (points.length <= 1) {
      return { x: paddingLeft + chartWidth / 2, yVisit: paddingTop + chartHeight / 2, yPeak: paddingTop + chartHeight / 2 };
    }
    const x = paddingLeft + (i / (points.length - 1)) * chartWidth;
    const yVisit = height - paddingBottom - (visit / leftMax) * chartHeight;
    const yPeak = height - paddingBottom - (peak / rightMax) * chartHeight;
    return { x, yVisit, yPeak };
  };

  let visitPath = "";
  let peakPath = "";
  let visitAreaPath = "";
  let peakAreaPath = "";

  if (points.length > 0) {
    const firstCoords = getCoords(0, points[0].visitCount, points[0].peakOnline);
    visitPath = `M ${firstCoords.x} ${firstCoords.yVisit}`;
    peakPath = `M ${firstCoords.x} ${firstCoords.yPeak}`;

    for (let i = 1; i < points.length; i++) {
      const coords = getCoords(i, points[i].visitCount, points[i].peakOnline);
      visitPath += ` L ${coords.x} ${coords.yVisit}`;
      peakPath += ` L ${coords.x} ${coords.yPeak}`;
    }

    const lastCoords = getCoords(points.length - 1, points[points.length - 1].visitCount, points[points.length - 1].peakOnline);
    visitAreaPath = `${visitPath} L ${lastCoords.x} ${height - paddingBottom} L ${firstCoords.x} ${height - paddingBottom} Z`;
    peakAreaPath = `${peakPath} L ${lastCoords.x} ${height - paddingBottom} L ${firstCoords.x} ${height - paddingBottom} Z`;
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = height - paddingBottom - ratio * chartHeight;
    const leftLabel = Math.round(ratio * leftMax);
    const rightLabel = Math.round(ratio * rightMax);
    return { y, leftLabel, rightLabel };
  });

  const step = points.length > 0 ? Math.ceil(points.length / 6) : 1;

  return (
    <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-text flex items-center gap-2 text-sm">
          <BarChart2 className="w-4 h-4 text-accent" />
          {t("trafficStats")}
        </h3>
        <div className="flex items-center gap-1 bg-surface-alt border border-border rounded-theme p-1">
          {(["day", "week", "month", "3month", "year"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer transition rounded-theme ${
                range === r
                  ? "bg-primary text-primary-foreground font-semibold shadow-[var(--theme-glow)]"
                  : "text-text-muted hover:text-text hover:bg-bg/40"
              }`}
            >
              {t(`range${r.charAt(0).toUpperCase() + r.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Live Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-bg/30 border border-border/40 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-primary/10 text-primary">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-text-dim uppercase">{t("liveOnline")}</div>
            <div className="text-lg font-bold font-mono text-primary">
              {statsData ? statsData.liveOnlineCount : "..."}
            </div>
          </div>
        </div>

        <div className="p-3 bg-bg/30 border border-border/40 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-accent/10 text-accent">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-text-dim uppercase">{t("todayVisits")}</div>
            <div className="text-lg font-bold font-mono text-accent">
              {statsData ? statsData.today.visitCount : "..."}
            </div>
          </div>
        </div>

        <div className="p-3 bg-bg/30 border border-border/40 rounded-lg flex items-center gap-3">
          <div className="p-2 rounded bg-success/10 text-success">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-text-dim uppercase">{t("todayPeakOnline")}</div>
            <div className="text-lg font-bold font-mono text-success">
              {statsData ? statsData.today.peakOnline : "..."}
            </div>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative border border-border/60 bg-bg/20 rounded-lg p-2 overflow-visible">
        <div className="flex justify-between text-[10px] text-text-muted px-2 mb-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent" />
            {t("visitCount")} (L)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-success" />
            {t("peakOnline")} (R)
          </span>
        </div>

        {points.length > 0 ? (
          <div className="relative w-full h-[240px]">
            {/* Hover clears on leaving the whole chart, not per-column — keeps the
                tooltip mounted while the cursor slides across, so its transform
                transition can glide instead of remounting at each column. */}
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-full select-none overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id="visitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--theme-accent))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(var(--theme-accent))" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="peakGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(var(--theme-success))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(var(--theme-success))" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {gridLines.map((line, idx) => (
                <g key={idx}>
                  <line
                    x1={paddingLeft}
                    y1={line.y}
                    x2={width - paddingRight}
                    y2={line.y}
                    stroke="currentColor"
                    className="text-border/30"
                    strokeDasharray="4 4"
                  />
                  {/* Left label (Visits) */}
                  <text
                    x={paddingLeft - 8}
                    y={line.y + 3}
                    textAnchor="end"
                    className="text-[9px] fill-text-dim font-mono"
                  >
                    {line.leftLabel}
                  </text>
                  {/* Right label (Peak Online) */}
                  <text
                    x={width - paddingRight + 8}
                    y={line.y + 3}
                    textAnchor="start"
                    className="text-[9px] fill-text-dim font-mono"
                  >
                    {line.rightLabel}
                  </text>
                </g>
              ))}

              {/* Areas */}
              {visitAreaPath && <path d={visitAreaPath} fill="url(#visitGradient)" />}
              {peakAreaPath && <path d={peakAreaPath} fill="url(#peakGradient)" />}

              {/* Lines */}
              {visitPath && (
                <path
                  d={visitPath}
                  fill="none"
                  stroke="currentColor"
                  className="text-accent"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {peakPath && (
                <path
                  d={peakPath}
                  fill="none"
                  stroke="currentColor"
                  className="text-success"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Bottom X-axis Labels */}
              {points.map((p, i) => {
                if (i % step !== 0 && i !== points.length - 1) return null;
                const coords = getCoords(i, p.visitCount, p.peakOnline);
                return (
                  <text
                    key={i}
                    x={coords.x}
                    y={height - paddingBottom + 18}
                    textAnchor="middle"
                    className="text-[9px] fill-text-dim font-mono"
                  >
                    {p.label}
                  </text>
                );
              })}

              {/* Hover trigger areas & highlights */}
              {points.map((p, i) => {
                const coords = getCoords(i, p.visitCount, p.peakOnline);
                const isHovered = hoveredIdx === i;
                return (
                  <g key={i}>
                    {/* Vertical line indicator */}
                    {isHovered && (
                      <line
                        x1={coords.x}
                        y1={paddingTop}
                        x2={coords.x}
                        y2={height - paddingBottom}
                        stroke="currentColor"
                        className="text-border/60"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Interactive hover column */}
                    <rect
                      x={coords.x - chartWidth / Math.max(1, points.length - 1) / 2}
                      y={paddingTop}
                      width={chartWidth / Math.max(1, points.length - 1)}
                      height={chartHeight}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(i)}
                    />

                    {/* Dot markers */}
                    {(isHovered || points.length <= 15) && (
                      <>
                        <circle
                          cx={coords.x}
                          cy={coords.yVisit}
                          r={isHovered ? 5.5 : 3.5}
                          className="fill-accent stroke-surface transition-[r,stroke-width] duration-150"
                          strokeWidth={isHovered ? 2 : 1}
                        />
                        <circle
                          cx={coords.x}
                          cy={coords.yPeak}
                          r={isHovered ? 5.5 : 3.5}
                          className="fill-success stroke-surface transition-[r,stroke-width] duration-150"
                          strokeWidth={isHovered ? 2 : 1}
                        />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Absolute HTML Tooltip */}
            {hoveredIdx !== null && points[hoveredIdx] && (
              <div
                className="absolute left-0 top-0 pointer-events-none bg-surface/95 border border-border p-2 shadow-xl text-xs flex flex-col gap-1 rounded-theme z-20 transition-transform duration-150 whitespace-nowrap"
                style={{
                  // Positioned via transform, not left/top: gliding between
                  // columns then transitions on the compositor instead of
                  // triggering layout every frame. (Dropping backdrop-blur is
                  // part of the same fix — a blur re-samples what's behind it
                  // on every frame of movement, and at 95% surface opacity it
                  // was invisible anyway.)
                  transform: `translate3d(${Math.min(
                    Math.max(10, getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).x - 65),
                    width - 140
                  )}px, ${Math.max(
                    10,
                    Math.min(
                      getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).yVisit,
                      getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).yPeak
                    ) - 75
                  )}px, 0)`,
                }}
              >
                <div className="font-bold border-b border-border/40 pb-0.5 mb-0.5 text-text">
                  {points[hoveredIdx].label}
                </div>
                <div className="text-accent flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  {t("visitCount")}: {points[hoveredIdx].visitCount}
                </div>
                <div className="text-success flex items-center gap-1.5 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  {t("peakOnline")}: {points[hoveredIdx].peakOnline}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-text-dim text-xs">
            {t("loadingChart")}
          </div>
        )}
      </div>
    </section>
  );
}
