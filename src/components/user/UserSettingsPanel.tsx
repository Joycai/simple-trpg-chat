"use client";

import { useState } from "react";
import { Shield, History, X, Bot, BarChart3, Coins } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { setUserLocale } from "@/app/actions/locale";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { SecurityTab } from "@/components/user/settings/SecurityTab";
import { LoginHistoryTab } from "@/components/user/settings/LoginHistoryTab";
import { AiProvidersTab } from "@/components/user/settings/AiProvidersTab";
import { AiUsageTab } from "@/components/user/settings/AiUsageTab";
import { AiPointsTab } from "@/components/user/settings/AiPointsTab";

interface UserSettingsPanelProps {
  userName: string;
  userRole: string;
  onClose: () => void;
}

type Tab = "security" | "history" | "ai" | "ai-usage" | "ai-points";

export function UserSettingsPanel({ userName, userRole, onClose }: UserSettingsPanelProps) {
  const ts = useTranslations("userSettings");
  const locale = useLocale();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);

  const [tab, setTab] = useState<Tab>("security");

  const handleLocaleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value as "zh" | "en";
    await setUserLocale(newLocale);
    window.location.reload();
  };

  const roleLabel = userRole === "admin" ? ts("roleAdmin") : userRole === "host" ? ts("roleHost") : ts("rolePlayer");
  const roleColor = userRole === "admin" ? "bg-danger/20 text-danger" : userRole === "host" ? "bg-success/20 text-success" : "bg-primary/20 text-primary";

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
      <div className={`bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md md:max-w-4xl mx-4 h-[85vh] md:h-[620px] max-h-[90vh] overflow-hidden flex flex-col ${panelClass}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-bold text-text text-lg">{ts("title")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text p-1 hover:bg-surface-alt rounded transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar + Language switcher */}
        <div className="px-5 py-3 bg-surface-alt/40 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
              {(userName || "")[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <div className="text-sm font-semibold text-text flex items-center gap-2">
                {userName}
                <span className={`px-2 py-0.5 rounded-theme text-[9px] font-extrabold tracking-wider uppercase ${roleColor}`}>{roleLabel}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-medium">{ts("language")}:</span>
            <select
              value={locale}
              onChange={handleLocaleChange}
              className="p-1 bg-surface border border-border rounded text-xs text-text outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Bottom Panel: Navigation + Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Navigation */}
          <div className="flex md:flex-col border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-x-visible md:overflow-y-auto select-none shrink-0 md:w-52 bg-surface-alt/10 py-1.5 md:py-4 px-2 gap-1 scrollbar-none">
            {([
              ["security", Shield, ts("tabSecurity")],
              ["history", History, ts("tabHistory")],
              ["ai", Bot, ts("tabAi")],
              ["ai-usage", BarChart3, ts("tabAiUsage")],
              ["ai-points", Coins, ts("tabAiPoints")],
            ] as const).map(([key, Icon, label]) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2.5 px-3 py-2 text-xs md:text-sm font-medium transition-all duration-150 rounded-theme md:w-full text-left shrink-0 cursor-pointer ${
                    isActive
                      ? "text-primary bg-primary/10 border-b-2 md:border-b-0 md:border-l-4 border-primary font-semibold"
                      : "text-text-muted hover:text-text hover:bg-surface-alt/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-text-dim"}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Pane */}
          <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-surface">
            {tab === "security" && <SecurityTab />}
            {tab === "history" && <LoginHistoryTab />}
            {tab === "ai" && <AiProvidersTab />}
            {tab === "ai-usage" && <AiUsageTab />}
            {tab === "ai-points" && <AiPointsTab userRole={userRole} />}
          </div>
        </div>
      </div>
    </div>
  );
}
