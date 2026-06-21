"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSiteThemeMode } from "@/app/actions/theme";
import { THEME_MODES, type ThemeMode } from "@/themes/types";
import { useTranslations } from "next-intl";

interface SiteThemeModeSelectorProps {
  currentMode: ThemeMode;
}

export function SiteThemeModeSelector({ currentMode }: SiteThemeModeSelectorProps) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tm = useTranslations("themeMode");
  const [mode, setMode] = useState<ThemeMode>(currentMode);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleChange = async (newMode: ThemeMode) => {
    setMode(newMode);
    setSaving(true);
    setMsg("");
    try {
      await setSiteThemeMode(newMode);
      setMsg(t("themeUpdated"));
      // Refresh to apply the new site mode to the admin panel
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
        {t("siteThemeMode")}
      </h3>
      <p className="text-xs text-text-muted mb-3">
        {t("siteThemeModeDesc")}
      </p>
      <div className="flex items-center gap-3">
        <select
          value={mode}
          onChange={(e) => handleChange(e.target.value as ThemeMode)}
          disabled={saving}
          className="p-2 bg-bg border border-border rounded text-text text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          {THEME_MODES.map((m) => (
            <option key={m} value={m}>
              {tm(m)}
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
