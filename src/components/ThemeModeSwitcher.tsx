"use client";

import { Monitor, Sun, Moon, type LucideIcon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useTranslations } from "next-intl";
import { THEME_MODES, type ThemeMode } from "@/themes/types";

const ICONS: Record<ThemeMode, LucideIcon> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

/** Compact auto/light/dark segmented control for the lobby top-bar (per-user). */
export function ThemeModeSwitcher() {
  const { mode, setMode } = useTheme();
  const t = useTranslations("themeMode");

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      title={t("switch")}
      className="flex items-center h-9 p-0.5 rounded-theme border border-border bg-surface-alt"
    >
      {THEME_MODES.map((m) => {
        const Icon = ICONS[m];
        const active = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            title={t(m)}
            onClick={() => setMode(m)}
            className={`flex items-center justify-center w-8 h-8 rounded-theme transition-colors cursor-pointer ${
              active ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="sr-only">{t(m)}</span>
          </button>
        );
      })}
    </div>
  );
}
