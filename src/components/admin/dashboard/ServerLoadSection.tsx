"use client";

import { useTranslations } from "next-intl";
import { Database, Activity, Cpu, Clock, Laptop } from "lucide-react";
import type { getServerLoadAction } from "@/app/actions/server-load";
import { StatusBadge } from "./StatCards";

type LoadData = Awaited<ReturnType<typeof getServerLoadAction>>;

export function ServerLoadSection({ loadData }: { loadData: LoadData | null }) {
  const t = useTranslations("admin");

  return (
    <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-text flex items-center gap-2 text-sm">
          <Activity className="w-4 h-4 text-accent animate-pulse" />
          {t("serverLoad")}
        </h3>
      </div>

      {loadData ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
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

          <div className="grid grid-cols-1 gap-3">
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
  );
}
