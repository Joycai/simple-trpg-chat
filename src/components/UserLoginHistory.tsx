"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone, Tablet, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface LoginRecord {
  id: number;
  ipAddress: string;
  userAgent: string | null;
  deviceType: string;
  loginAt: string;
}

const deviceIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: HelpCircle,
};

const deviceLabels: Record<string, string> = {
  desktop: "PC",
  mobile: "手机",
  tablet: "平板",
  unknown: "未知",
};

export function UserLoginHistory({ records }: { records: LoginRecord[] }) {
  const t = useTranslations("admin");

  if (records.length === 0) {
    return (
      <div className="text-center text-text-dim py-8 text-sm">
        暂无登录记录
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {records.map((r) => {
        const Icon = deviceIcons[r.deviceType] || HelpCircle;
        const label = deviceLabels[r.deviceType] || "未知";
        const time = new Date(r.loginAt + "Z").toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div key={r.id} className="flex items-center gap-3 p-2.5 bg-surface-alt rounded-lg border border-border text-xs">
            <Icon className="w-4 h-4 text-text-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-text">{r.ipAddress}</span>
                <span className="text-text-dim">({label})</span>
              </div>
              <div className="text-text-dim truncate mt-0.5" title={r.userAgent || ""}>
                {r.userAgent || "—"}
              </div>
            </div>
            <span className="text-text-dim shrink-0">{time}</span>
          </div>
        );
      })}
    </div>
  );
}
