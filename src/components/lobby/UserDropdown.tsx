"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, SlidersHorizontal, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/user";
import { useTranslations } from "next-intl";
import { UserSettingsPanel } from "@/components/user/UserSettingsPanel";

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
          aria-haspopup="menu"
          aria-expanded={open}
          title={userName}
          className="flex items-center gap-2 h-9 px-2.5 rounded-theme border border-border bg-surface-alt text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
        >
          <span className={`grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold uppercase border shrink-0 ${roleColor}`}>
            {userName.charAt(0)}
          </span>
          <span className="hidden sm:inline text-sm max-w-[8rem] truncate text-text">{userName}</span>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="overlay-pop theme-border absolute right-0 top-full mt-2 w-60 bg-surface border border-border rounded-theme z-50 overflow-hidden p-1.5"
            style={{ transformOrigin: "top right" }}
          >
            {/* Profile info */}
            <div className="flex items-center gap-3 px-2.5 py-3 border-b border-border mb-1">
              <span className={`grid place-items-center w-10 h-10 rounded-full text-sm font-bold uppercase border shrink-0 ${roleColor}`}>
                {userName.charAt(0)}
              </span>
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-text truncate">{userName}</span>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleColor}`}>
                  {roleLabel}
                </span>
              </div>
            </div>

            {/* Personal Settings */}
            <button
              onClick={() => { setOpen(false); setShowSettings(true); }}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-theme text-sm text-text hover:bg-surface-alt transition-colors text-left cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-text-muted" />
              {ts("title")}
            </button>

            {/* Logout */}
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-theme text-sm text-text hover:bg-surface-alt transition-colors text-left cursor-pointer"
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
