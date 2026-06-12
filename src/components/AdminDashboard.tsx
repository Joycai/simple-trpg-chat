"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Database, HardDrive, Activity, Cpu, Clock, Laptop, RefreshCw, Users, TrendingUp, Eye, BarChart2 } from "lucide-react";
import type { ReactNode } from "react";
import { getServerLoadAction } from "@/app/actions/server-load";
import { getServerStatsAction } from "@/app/actions/stats";

interface AdminDashboardProps {
  dbType: string;
  totalUsers: number;
  adminCount: number;
  hostCount: number;
  playerCount: number;
  botCount: number;
  roomCount: number;
  aiEnabled: boolean;
}

export function AdminDashboard({
  dbType, totalUsers, adminCount, hostCount, playerCount,
  botCount, roomCount, aiEnabled,
}: AdminDashboardProps) {
  const t = useTranslations("admin");
  const [loadData, setLoadData] = useState<any>(null);
  const [statsData, setStatsData] = useState<{
    liveOnlineCount: number;
    today: { visitCount: number; peakOnline: number };
    series: { label: string; visitCount: number; peakOnline: number }[];
  } | null>(null);
  const [range, setRange] = useState<"day" | "week" | "month" | "3month" | "year">("day");
  const [loading, setLoading] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const fetchLoad = async () => {
    try {
      const data = await getServerLoadAction();
      setLoadData(data);
    } catch (e) {
      console.error("Failed to fetch server load:", e);
    }
  };

  const fetchStats = async (r: "day" | "week" | "month" | "3month" | "year") => {
    try {
      const data = await getServerStatsAction(r);
      setStatsData(data);
    } catch (e) {
      console.error("Failed to fetch server stats:", e);
    }
  };

  useEffect(() => {
    fetchLoad();
    const loadInterval = setInterval(fetchLoad, 10000);
    return () => clearInterval(loadInterval);
  }, []);

  useEffect(() => {
    fetchStats(range);
    const statsInterval = setInterval(() => fetchStats(range), 15000);
    return () => clearInterval(statsInterval);
  }, [range]);

  const handleManualRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchLoad(), fetchStats(range)]);
    setLoading(false);
  };

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
    <div className="flex flex-col gap-6">
      {/* System Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusBadge
          label={t("dbType")}
          value={dbType === "postgresql" ? <span className="inline-flex items-center gap-1"><Database className="w-3.5 h-3.5" /> PostgreSQL</span> : <span className="inline-flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> SQLite</span>}
          accent="primary"
        />
        <StatusBadge
          label={t("aiFeature")}
          value={aiEnabled ? t("enabled") : t("disabled")}
          accent={aiEnabled ? "success" : "muted"}
        />
        <StatusBadge
          label={t("rooms")}
          value={`${roomCount}`}
          accent="accent"
        />
        <StatusBadge
          label={t("bots")}
          value={`${botCount}`}
          accent="accent"
        />
      </div>

      {/* Traffic Statistics & Charts */}
      <section className="bg-surface p-5 theme-border border border-border shadow-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-text flex items-center gap-2 text-sm">
            <BarChart2 className="w-4 h-4 text-accent" />
            {t("trafficStats")}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex bg-surface-alt border border-border rounded overflow-hidden">
              {(["day", "week", "month", "3month", "year"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                    range === r
                      ? "bg-accent text-surface font-semibold"
                      : "text-text-muted hover:text-text hover:bg-bg/40"
                  }`}
                >
                  {t(`range${r.charAt(0).toUpperCase() + r.slice(1)}`)}
                </button>
              ))}
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="text-text-muted hover:text-text p-1 rounded hover:bg-surface-alt transition disabled:opacity-50 cursor-pointer"
              title={t("refresh")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
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
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none overflow-visible">
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
                        onMouseLeave={() => setHoveredIdx(null)}
                      />

                      {/* Dot markers */}
                      {(isHovered || points.length <= 15) && (
                        <>
                          <circle
                            cx={coords.x}
                            cy={coords.yVisit}
                            r={isHovered ? 5.5 : 3.5}
                            className="fill-accent stroke-surface transition-all duration-150"
                            strokeWidth={isHovered ? 2 : 1}
                          />
                          <circle
                            cx={coords.x}
                            cy={coords.yPeak}
                            r={isHovered ? 5.5 : 3.5}
                            className="fill-success stroke-surface transition-all duration-150"
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
                  className="absolute pointer-events-none bg-surface/95 backdrop-blur-sm border border-border p-2 shadow-xl text-xs flex flex-col gap-1 rounded-theme z-20 transition-all duration-150 whitespace-nowrap"
                  style={{
                    left: `${Math.min(
                      Math.max(10, getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).x - 65),
                      width - 140
                    )}px`,
                    top: `${Math.max(
                      10,
                      Math.min(
                        getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).yVisit,
                        getCoords(hoveredIdx, points[hoveredIdx].visitCount, points[hoveredIdx].peakOnline).yPeak
                      ) - 75
                    )}px`,
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

      {/* Server Load Section */}
      <section className="bg-surface p-5 theme-border border border-border shadow-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-text flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-accent animate-pulse" />
            {t("serverLoad")}
          </h3>
        </div>

        {loadData ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CPU Metric */}
              <div className="p-3 bg-bg/40 border border-border/60 rounded-lg flex flex-col gap-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-text-muted flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    {t("cpu")}
                  </span>
                  <span className="text-text font-mono">{loadData.cpuUsage}%</span>
                </div>
                <div className="w-full bg-border/40 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      loadData.cpuUsage > 80
                        ? "bg-danger"
                        : loadData.cpuUsage > 50
                        ? "bg-accent"
                        : "bg-success"
                    }`}
                    style={{ width: `${loadData.cpuUsage}%` }}
                  />
                </div>
              </div>

              {/* Memory Metric */}
              <div className="p-3 bg-bg/40 border border-border/60 rounded-lg flex flex-col gap-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-text-muted flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    {t("memory")}
                  </span>
                  <span className="text-text font-mono">
                    {loadData.memory.used} GB / {loadData.memory.total} GB ({loadData.memory.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-border/40 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      loadData.memory.percentage > 85
                        ? "bg-danger"
                        : loadData.memory.percentage > 60
                        ? "bg-accent"
                        : "bg-success"
                    }`}
                    style={{ width: `${loadData.memory.percentage}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatusBadge
                label={t("uptime")}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-text-dim" />
                    {loadData.uptime.days > 0 ? t("uptimeDays", { count: loadData.uptime.days }) : ""}
                    {t("uptimeHoursMinutes", { hours: loadData.uptime.hours, minutes: loadData.uptime.minutes })}
                  </span>
                }
                accent="accent"
              />
              <StatusBadge
                label={t("processMemory")}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    {loadData.processMemory} MB
                  </span>
                }
                accent="accent"
              />
              <StatusBadge
                label={t("os")}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-xs truncate" title={`${loadData.os.platform} (${loadData.os.release})`}>
                    <Laptop className="w-3.5 h-3.5 shrink-0 text-text-dim" />
                    {loadData.os.platform} ({loadData.os.arch})
                  </span>
                }
                accent="accent"
              />
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-text-dim text-xs animate-pulse">
            {t("loadingMonitor")}
          </div>
        )}
      </section>

      {/* User Account Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={t("totalUsers")} value={totalUsers} accent="primary" />
        <StatCard label={t("roleAdmin")} value={adminCount} accent="danger" />
        <StatCard label={t("roleHost")} value={hostCount} accent="success" />
        <StatCard label={t("rolePlayer")} value={playerCount} accent="accent" />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const borders: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5",
    danger: "border-danger/30 bg-danger/5",
    success: "border-success/30 bg-success/5",
    accent: "border-accent/30 bg-accent/5",
  };
  const texts: Record<string, string> = {
    primary: "text-primary",
    danger: "text-danger",
    success: "text-success",
    accent: "text-accent",
  };
  return (
    <div className={`theme-border border p-4 hover:scale-[1.02] transition-all duration-200 rounded-theme ${borders[accent] || borders.primary}`}>
      <div className="text-xs text-text-dim mb-1">{label}</div>
      <div className={`text-2xl font-bold ${texts[accent] || texts.primary}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ label, value, accent }: { label: string; value: ReactNode; accent: string }) {
  const styles: Record<string, string> = {
    primary: "border-primary/20 bg-primary/5 text-primary",
    success: "border-success/20 bg-success/5 text-success",
    muted: "border-border bg-surface-alt text-text-muted",
    accent: "border-accent/20 bg-accent/5 text-accent",
  };
  return (
    <div className={`theme-border border p-3 hover:scale-[1.01] transition-all duration-200 rounded-theme ${styles[accent] || styles.primary}`}>
      <div className="text-[10px] text-text-dim uppercase mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
