"use client";

import { useState } from "react";
import { Monitor, Smartphone, Tablet, HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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

export function parseLoginDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // Replace space between date and time with 'T' for ISO conformance
  let isoStr = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");

  // Normalize timezone offset with hours only (e.g. +08 or -05) to full offset (e.g. +08:00 or -05:00)
  if (/[+-]\d{2}$/.test(isoStr)) {
    isoStr = isoStr + ":00";
  }

  // Check if it already has timezone information
  const hasTimezone = isoStr.endsWith("Z") ||
                      isoStr.includes("+") ||
                      (isoStr.indexOf("-", 11) !== -1);

  const dateToParse = hasTimezone ? isoStr : isoStr + "Z";
  const parsed = new Date(dateToParse);

  // Fallback to original string if parsing failed
  if (isNaN(parsed.getTime())) {
    return new Date(dateStr);
  }
  return parsed;
}

/** Best-effort "Browser · OS" summary from a raw user-agent string. */
function uaSummary(ua: string | null, deviceLabel: string): string {
  if (!ua) return deviceLabel;
  const browser = /Edg/.test(ua) ? "Edge"
    : /OPR|Opera/.test(ua) ? "Opera"
    : /Chrome/.test(ua) ? "Chrome"
    : /Firefox/.test(ua) ? "Firefox"
    : /Safari/.test(ua) ? "Safari"
    : null;
  const os = /Windows/.test(ua) ? "Windows"
    : /(iPhone|iPad|iPod)/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser || os || deviceLabel;
}

export function UserLoginHistory({ records }: { records: LoginRecord[] }) {
  const t = useTranslations("device");
  const ts = useTranslations("userSettings");
  const locale = useLocale();
  // Captured once so relative-time formatting stays pure across re-renders.
  const [now] = useState(() => Date.now());

  const relTime = (d: Date): string => {
    const diffMin = Math.floor((now - d.getTime()) / 60000);
    const zh = locale === "zh";
    const hm = d.toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: !zh });
    if (diffMin < 1) return zh ? "刚刚" : "Just now";
    if (diffMin < 60) return zh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return zh ? `${diffHr} 小时前` : `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return zh ? `昨天 ${hm}` : `Yesterday ${hm}`;
    if (diffDay < 7) return zh ? `${diffDay} 天前` : `${diffDay}d ago`;
    return d.toLocaleDateString(zh ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  };

  if (records.length === 0) {
    return (
      <div className="text-center text-text-dim py-8 text-sm">
        {ts("emptyHistory")}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
      {records.map((r) => {
        const Icon = deviceIcons[r.deviceType] || HelpCircle;
        const label = t(r.deviceType) || r.deviceType;
        const parsedDate = parseLoginDate(r.loginAt);
        return (
          <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-alt/40 rounded-theme border border-border">
            <span className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text truncate">{uaSummary(r.userAgent, label)}</div>
              <div className="text-xs text-text-dim font-theme-mono truncate" title={r.userAgent || ""}>{r.ipAddress}</div>
            </div>
            <span className="text-xs text-text-muted shrink-0 whitespace-nowrap">{relTime(parsedDate)}</span>
          </div>
        );
      })}
    </div>
  );
}
