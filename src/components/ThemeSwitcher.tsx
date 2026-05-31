"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeSwitcher() {
  const { theme, setTheme, themeList } = useTheme();

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as typeof theme)}
      className="text-xs bg-surface-alt border border-border rounded px-2 py-1 text-text-muted outline-none focus:ring-1 focus:ring-primary cursor-pointer"
      title="切换主题"
    >
      {themeList.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
