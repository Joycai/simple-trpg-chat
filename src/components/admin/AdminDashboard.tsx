"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Database, HardDrive, RefreshCw } from "lucide-react";
import { getServerLoadAction } from "@/app/actions/server-load";
import { getServerStatsAction } from "@/app/actions/stats";
import { StatCard, StatusBadge } from "@/components/admin/dashboard/StatCards";
import { TrafficStatsSection, type StatsData, type StatsRange } from "@/components/admin/dashboard/TrafficStatsSection";
import { ServerLoadSection } from "@/components/admin/dashboard/ServerLoadSection";

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
  const [loadData, setLoadData] = useState<Awaited<ReturnType<typeof getServerLoadAction>> | null>(null);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [range, setRange] = useState<StatsRange>("day");
  const [loading, setLoading] = useState(false);

  const fetchLoad = async () => {
    try {
      const data = await getServerLoadAction();
      setLoadData(data);
    } catch (e) {
      console.error("Failed to fetch server load:", e);
    }
  };

  const fetchStats = async (r: StatsRange) => {
    try {
      const data = await getServerStatsAction(r);
      setStatsData(data);
    } catch (e) {
      console.error("Failed to fetch server stats:", e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLoad();
    const loadInterval = setInterval(() => { void fetchLoad(); }, 10000);
    return () => clearInterval(loadInterval);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStats(range);
    const statsInterval = setInterval(() => { void fetchStats(range); }, 15000);
    return () => clearInterval(statsInterval);
  }, [range]);

  const handleManualRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchLoad(), fetchStats(range)]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("dashboardTitle")}</h1>
          <p className="text-sm text-text-muted mt-1">{t("dashboardDesc")}</p>
        </div>
        <button
          onClick={handleManualRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-theme border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-alt transition disabled:opacity-50 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span className="text-sm font-medium">{t("refresh")}</span>
        </button>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatusBadge
          label={t("dbType")}
          value={dbType === "postgresql" ? <span className="inline-flex items-center gap-2"><Database className="w-5 h-5" /> PostgreSQL</span> : <span className="inline-flex items-center gap-2"><HardDrive className="w-5 h-5" /> SQLite</span>}
          accent="primary"
        />
        <StatusBadge
          label={t("aiFeature")}
          value={
            <span className="inline-flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${aiEnabled ? "bg-success animate-pulse" : "bg-text-dim"}`} />
              {aiEnabled ? t("enabled") : t("disabled")}
            </span>
          }
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
          accent="ai"
        />
      </div>

      {/* Traffic + Server Load — two columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrafficStatsSection
            statsData={statsData}
            range={range}
            onRangeChange={setRange}
          />
        </div>
        <div className="lg:col-span-1">
          <ServerLoadSection loadData={loadData} />
        </div>
      </div>

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
