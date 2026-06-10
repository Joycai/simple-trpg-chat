"use client";

import { useTranslations } from "next-intl";
import { Database, HardDrive } from "lucide-react";
import type { ReactNode } from "react";

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
    <div className="flex flex-col gap-6 p-6">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
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
    <div className={`rounded-xl border p-4 ${borders[accent] || borders.primary}`}>
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
    <div className={`rounded-lg border p-3 ${styles[accent] || styles.primary}`}>
      <div className="text-[10px] text-text-dim uppercase mb-0.5">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
