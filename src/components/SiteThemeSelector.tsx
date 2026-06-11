"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSiteTheme } from "@/app/actions/theme";
import { THEME_LIST, type ThemeId } from "@/themes/types";
import { useTranslations } from "next-intl";

interface SiteThemeSelectorProps {
  currentTheme: ThemeId;
}

export function SiteThemeSelector({ currentTheme }: SiteThemeSelectorProps) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tThemes = useTranslations("themes");
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = async (newTheme: ThemeId) => {
    setTheme(newTheme);
    setSaving(true);
    setMsg("");
    try {
      await setSiteTheme(newTheme);
      setMsg(t("themeUpdated"));
      // Refresh to apply the new site theme to the admin panel
      router.refresh();
    } catch {
      setMsg(t("saveFailed"));
    }
    setSaving(false);
  };

  return (
    <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
      <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {t("siteTheme")}
      </h3>
      <p className="text-xs text-text-muted mb-3">
        {t("siteThemeDesc")}
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
              {tThemes(`${tm.id}.name`)} — {tThemes(`${tm.id}.desc`)}
            </option>
          ))}
        </select>
        {saving && (
          <span className="text-xs text-text-muted animate-pulse">{t("saving")}</span>
        )}
        {msg && (
          <span className="text-xs text-success">{msg}</span>
        )}
      </div>
    </section>
  );
}
