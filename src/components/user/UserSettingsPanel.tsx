"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Shield, History, X, Bot, BarChart3, Coins } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { setUserLocale } from "@/app/actions/locale";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { BadgeDropdown, type BadgeDropdownItem } from "@/components/shared/BadgeDropdown";
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

  const [tab, setTab] = useState<Tab>("security");

  const handleLocaleChange = async (newLocale: string) => {
    await setUserLocale(newLocale as "zh" | "en");
    window.location.reload();
  };

  const localeItems: BadgeDropdownItem[] = [
    { id: "zh", label: "中文", badge: { letters: "中" } },
    { id: "en", label: "English", badge: { letters: "EN" } },
  ];

  const roleLabel = userRole === "admin" ? ts("roleAdmin") : userRole === "host" ? ts("roleHost") : ts("rolePlayer");
  const roleColor = userRole === "admin" ? "bg-danger/20 text-danger border-danger/30" : userRole === "host" ? "bg-success/20 text-success border-success/30" : "bg-primary/20 text-primary border-primary/30";

  // Portal to <body>: the rainglass header sets `backdrop-filter`, which makes it
  // the containing block for `position: fixed`, so this modal must escape the
  // header to center on the viewport. (Only renders after a client click.)
  if (typeof document === "undefined") return null;

  return createPortal(
    <OverlayShell
      onClose={onClose}
      panelClassName="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md md:max-w-4xl mx-4 h-[85vh] md:h-[620px] max-h-[90vh] overflow-hidden flex flex-col"
    >
      {(close) => (
        <>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-bold text-text text-xl">{ts("title")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text p-1 hover:bg-surface-alt rounded-theme transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info bar + Language switcher */}
        <div className="px-6 py-4 bg-surface-alt/40 border-b border-border flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base border border-primary/30">
              {(userName || "")[0]?.toUpperCase() || "?"}
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-base font-semibold text-text">{userName}</span>
              <span className={`px-2 py-0.5 rounded-theme text-[10px] font-extrabold tracking-wider uppercase border ${roleColor}`}>{roleLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted font-medium">{ts("language")}</span>
            <div className="w-44">
              <BadgeDropdown
                value={locale}
                onChange={handleLocaleChange}
                headerText={ts("language")}
                tone="primary"
                items={localeItems}
              />
            </div>
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
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-xs md:text-sm font-medium transition-all duration-150 rounded-theme md:w-full text-left shrink-0 cursor-pointer border ${
                    isActive
                      ? "text-primary bg-primary/10 border-primary/30 font-semibold"
                      : "text-text-muted hover:text-text hover:bg-surface-alt/50 border-transparent"
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
        </>
      )}
    </OverlayShell>,
    document.body,
  );
}
