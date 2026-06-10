"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSiteTheme } from "@/app/actions/theme";
import { THEME_LIST, type ThemeId } from "@/themes/types";

interface SiteThemeSelectorProps {
  currentTheme: ThemeId;
}

export function SiteThemeSelector({ currentTheme }: SiteThemeSelectorProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = async (newTheme: ThemeId) => {
    setTheme(newTheme);
    setSaving(true);
    setMsg("");
    try {
      await setSiteTheme(newTheme);
      setMsg("主题已更新");
      // Refresh to apply the new site theme to the admin panel
      router.refresh();
    } catch {
      setMsg("保存失败，请重试");
    }
    setSaving(false);
  };

  return (
    <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
      <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {"网站主题"}
      </h3>
      <p className="text-xs text-text-muted mb-3">
        {"设置全站默认主题。应用于登录页、Admin 面板和新用户的大厅。"}
      </p>
      <div className="flex items-center gap-3">
        <select
          value={theme}
          onChange={(e) => handleChange(e.target.value as ThemeId)}
          disabled={saving}
          className="p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          {THEME_LIST.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name} — {tm.description}
            </option>
          ))}
        </select>
        {saving && (
          <span className="text-xs text-text-muted animate-pulse">{"保存中..."}</span>
        )}
        {msg && (
          <span className="text-xs text-success">{msg}</span>
        )}
      </div>
    </section>
  );
}
