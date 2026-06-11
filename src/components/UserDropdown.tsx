"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, User, Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/user";
import { useTranslations } from "next-intl";
import { UserSettingsPanel } from "@/components/UserSettingsPanel";

interface UserDropdownProps {
  userName: string;
  userRole: string;
}

export function UserDropdown({ userName, userRole }: UserDropdownProps) {
  const t = useTranslations("lobby");
  const ts = useTranslations("userSettings");
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const roleLabel =
    userRole === "admin"
      ? ts("roleAdmin")
      : userRole === "host"
        ? ts("roleHost")
        : ts("rolePlayer");

  const roleColor =
    userRole === "admin"
      ? "bg-danger/20 text-danger border-danger/30"
      : userRole === "host"
        ? "bg-success/20 text-success border-success/30"
        : "bg-primary/20 text-primary border-primary/30";

  return (
    <>
      <div className="relative" ref={ref}>
        {/* Trigger */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline">{userName}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleColor}`}>
              {roleLabel}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-theme shadow-lg z-50 overflow-hidden">
            {/* Profile info */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-text-muted" />
                <span className="text-sm font-medium text-text">{userName}</span>
              </div>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleColor}`}>
                {roleLabel}
              </span>
            </div>

            {/* Personal Settings */}
            <button
              onClick={() => { setOpen(false); setShowSettings(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors text-left cursor-pointer"
            >
              <Settings className="w-4 h-4 text-text-muted" />
              {ts("title")}
            </button>

            {/* Logout */}
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text hover:bg-surface-alt transition-colors text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-text-muted" />
                {t("logout")}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <UserSettingsPanel
          userName={userName}
          userRole={userRole}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
