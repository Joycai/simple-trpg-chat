"use client";

import { Monitor, Sun, Moon, type LucideIcon } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useTranslations } from "next-intl";
import { THEME_MODES, type ThemeMode } from "@/themes/types";

const ICONS: Record<ThemeMode, LucideIcon> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

/** Single-button auto→light→dark cycler for the lobby top-bar (per-user).
    The icon reflects the current mode; clicking advances to the next one. */
export function ThemeModeSwitcher() {
  const { mode, setMode } = useTheme();
  const t = useTranslations("themeMode");

  const Icon = ICONS[mode];
  const nextMode = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];

  return (
    <button
      type="button"
      aria-label={t("label")}
      title={`${t(mode)} · ${t("switch")}`}
      onClick={() => setMode(nextMode)}
      className="flex items-center justify-center w-9 h-9 rounded-theme border border-border bg-surface-alt text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
    >
      <Icon className="w-4 h-4" />
      <span className="sr-only">{t(mode)}</span>
    </button>
  );
}
