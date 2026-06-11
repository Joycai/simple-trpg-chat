"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Database, HardDrive, Activity, Cpu, Clock, Laptop, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { getServerLoadAction } from "@/app/actions/server-load";

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
  const [loading, setLoading] = useState(false);

  const fetchLoad = async () => {
    try {
      const data = await getServerLoadAction();
      setLoadData(data);
    } catch (e) {
      console.error("Failed to fetch server load:", e);
    }
  };

  useEffect(() => {
    fetchLoad();
    const interval = setInterval(fetchLoad, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchLoad();
    setLoading(false);
  };

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

      {/* Server Load Section */}
      <section className="bg-surface p-5 theme-border border border-border shadow-lg flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-text flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-accent animate-pulse" />
            {t("serverLoad") || "服务器负载"}
          </h3>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="text-text-muted hover:text-text p-1 rounded hover:bg-surface-alt transition disabled:opacity-50 cursor-pointer"
            title={t("refresh") || "刷新"}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loadData ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CPU Metric */}
              <div className="p-3 bg-bg/40 border border-border/60 rounded-lg flex flex-col gap-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-text-muted flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" />
                    {t("cpu") || "CPU 使用率"}
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
                    {t("memory") || "内存使用率"}
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

            <div className="grid grid-cols-3 gap-3">
              <StatusBadge
                label={t("uptime") || "系统运行时间"}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-text-dim" />
                    {loadData.uptime.days > 0 ? `${loadData.uptime.days}天 ` : ""}
                    {loadData.uptime.hours}时{loadData.uptime.minutes}分
                  </span>
                }
                accent="accent"
              />
              <StatusBadge
                label={t("processMemory") || "Node 进程内存"}
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    {loadData.processMemory} MB
                  </span>
                }
                accent="accent"
              />
              <StatusBadge
                label={t("os") || "运行环境"}
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
            加载系统监控数据中...
          </div>
        )}
      </section>

      {/* Stats Cards */}
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
    <div className={`theme-border border p-4 hover:scale-[1.02] transition-all duration-200 ${borders[accent] || borders.primary}`}>
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
    <div className={`theme-border border p-3 hover:scale-[1.01] transition-all duration-200 ${styles[accent] || styles.primary}`}>
      <div className="text-[10px] text-text-dim uppercase mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
