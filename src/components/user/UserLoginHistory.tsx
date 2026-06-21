"use client";

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

export function UserLoginHistory({ records }: { records: LoginRecord[] }) {
  const t = useTranslations("device");
  const ts = useTranslations("userSettings");
  const locale = useLocale();

  if (records.length === 0) {
    return (
      <div className="text-center text-text-dim py-8 text-sm">
        {ts("emptyHistory")}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {records.map((r) => {
        const Icon = deviceIcons[r.deviceType] || HelpCircle;
        const label = t(r.deviceType) || r.deviceType;
        const parsedDate = parseLoginDate(r.loginAt);
        const time = parsedDate.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
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
