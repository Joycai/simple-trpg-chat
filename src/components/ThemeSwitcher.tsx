"use client";

import { useTheme } from "./ThemeProvider";
import { useLocale, useTranslations } from "next-intl";
import { getThemeName } from "@/themes/types";

export function ThemeSwitcher() {
  const { theme, setTheme, themeList } = useTheme();
  const t = useTranslations("theme");
  const locale = useLocale();

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as typeof theme)}
      className="text-xs bg-surface-alt border border-border rounded px-2 py-1 text-text-muted outline-none focus:ring-1 focus:ring-primary cursor-pointer"
      title={t("switch")}
    >
      {themeList.map((themeItem) => (
        <option key={themeItem.id} value={themeItem.id}>
          {getThemeName(themeItem.id, locale)}
        </option>
      ))}
    </select>
  );
}
