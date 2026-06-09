"use client";

import { useTranslations } from "next-intl";

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

  return (
    <div className="flex flex-col gap-6">
      {/* System Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusBadge
          label={t("dbType")}
          value={dbType === "postgresql" ? "🐘 PostgreSQL" : "📦 SQLite"}
          color={dbType === "postgresql" ? "emerald" : "blue"}
        />
        <StatusBadge
          label="AI"
          value={aiEnabled ? t("enabled") : t("disabled")}
          color={aiEnabled ? "emerald" : "purple"}
        />
        <StatusBadge
          label={t("rooms")}
          value={`${roomCount} ${t("roomsCount")}`}
          color="purple"
        />
        <StatusBadge
          label="Bot"
          value={`${botCount} ${t("botsCount")}`}
          color="amber"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label={t("totalUsers")} value={totalUsers} color="purple" />
        <StatCard label={t("roleAdmin")} value={adminCount} color="rose" />
        <StatCard label={t("roleHost")} value={hostCount} color="emerald" />
        <StatCard label={t("rolePlayer")} value={playerCount} color="blue" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    purple: "border-purple-500/30 bg-purple-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
  };
  const textColors: Record<string, string> = {
    purple: "text-purple-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.purple}`}>
      <div className="text-xs text-purple-400/50 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColors[color] || textColors.purple}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    purple: "border-purple-500/20 bg-purple-500/5 text-purple-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || colors.purple}`}>
      <div className="text-[10px] text-purple-400/40 uppercase mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
