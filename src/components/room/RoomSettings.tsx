"use client";

import { useState } from "react";
import { Palette, SlidersHorizontal, X, Monitor, Sun, Moon, type LucideIcon } from "lucide-react";
import { updateRoomSettingsAction } from "@/app/actions/room";
import { THEME_LIST, THEME_MODES, getThemeName } from "@/themes/types";
import type { ThemeId, ThemeMode } from "@/themes/types";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import { listRules } from "@/lib/rules";

const MODE_ICONS: Record<ThemeMode, LucideIcon> = { auto: Monitor, light: Sun, dark: Moon };

interface RoomSettingsProps {
  roomId: number;
  roomName: string;
  currentTheme: ThemeId;
  currentThemeMode: ThemeMode;
  currentRuleTemplate?: string;
  onClose: () => void;
}

type SettingsTab = "theme" | "general";

export function RoomSettings({ roomId, roomName, currentTheme, currentThemeMode, currentRuleTemplate, onClose }: RoomSettingsProps) {
  const t = useTranslations("roomSettings");
  const tm = useTranslations("themeMode");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<SettingsTab>("theme");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(currentTheme);
  const [selectedMode, setSelectedMode] = useState<ThemeMode>(currentThemeMode);
  const [selectedRuleTemplate, setSelectedRuleTemplate] = useState<string>(currentRuleTemplate || "basic");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, close: () => void) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("theme", selectedTheme);
      formData.set("themeMode", selectedMode);
      formData.set("ruleTemplate", selectedRuleTemplate);

      await updateRoomSettingsAction(roomId, formData);

      close();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    ["theme", Palette, t("tabTheme")],
    ["general", SlidersHorizontal, t("tabGeneral")],
  ] as const;

  return (
    <OverlayShell
      onClose={onClose}
      panelClassName="bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md md:max-w-2xl mx-4 h-[85vh] md:h-[34rem] max-h-[90vh] overflow-hidden flex flex-col"
    >
      {(close) => (
        <>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h3 className="font-bold text-xl text-text font-theme-display">{t("title")}</h3>
          <button onClick={close} aria-label={tCommon("close")} className="text-text-muted hover:text-text p-1 hover:bg-surface-alt rounded-theme transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e, close)} className="flex-1 flex flex-col overflow-hidden">
          {/* Navigation + Content */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left tab rail */}
            <div className="flex md:flex-col border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-x-visible md:overflow-y-auto select-none shrink-0 md:w-44 bg-surface-alt/10 py-1.5 md:py-4 px-2 gap-1 scrollbar-none">
              {tabs.map(([key, Icon, label]) => {
                const isActive = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 text-xs md:text-sm font-medium transition-all duration-150 rounded-theme md:w-full text-left shrink-0 cursor-pointer border ${
                      isActive
                        ? "text-primary bg-primary/10 border-primary/40 font-semibold"
                        : "text-text-muted border-transparent hover:text-text hover:bg-surface-alt/50"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-text-dim"}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content pane — keyed so it replays the fade-rise on tab change */}
            <div key={tab} className="lobby-pane-in flex-1 overflow-y-auto p-5 md:p-6 bg-surface">
              {tab === "theme" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                      <Palette className="w-5 h-5 text-primary" />
                      {t("themeLabel")}
                    </h4>
                    <p className="text-xs text-text-muted">{t("desc", { roomName })}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {THEME_LIST.map((theme) => {
                      const active = selectedTheme === theme.id;
                      return (
                        <label
                          key={theme.id}
                          className={`flex items-center gap-3 px-4 py-3.5 rounded-theme border cursor-pointer transition ${
                            active ? "border-primary bg-primary/10" : "border-border hover:border-text-muted"
                          }`}
                        >
                          <input
                            type="radio"
                            name="theme"
                            value={theme.id}
                            checked={active}
                            onChange={() => setSelectedTheme(theme.id as ThemeId)}
                            className="sr-only"
                          />
                          <span className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition ${active ? "border-primary" : "border-input-border"}`}>
                            {active && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </span>
                          <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">{getThemeName(theme.id, locale)}</span>
                          {/* Theme preview dot — colors come from the theme registry */}
                          <span
                            className="w-5 h-5 rounded-full border-2 shrink-0"
                            style={{ backgroundColor: theme.swatch.bg, borderColor: theme.swatch.border }}
                          />
                        </label>
                      );
                    })}
                  </div>

                  {/* Color mode — applies to all participants in this room */}
                  <div className="mt-1">
                    <h5 className="text-sm font-semibold text-text mb-1">{t("themeModeLabel")}</h5>
                    <p className="text-xs text-text-muted mb-2.5">{t("themeModeHint")}</p>
                    <div role="radiogroup" aria-label={t("themeModeLabel")} className="grid grid-cols-3 gap-2.5">
                      {THEME_MODES.map((m) => {
                        const Icon = MODE_ICONS[m];
                        const active = selectedMode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setSelectedMode(m)}
                            className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-theme border transition cursor-pointer ${
                              active
                                ? "border-primary bg-primary/10 text-primary shadow-[var(--theme-glow)]"
                                : "border-border text-text-muted hover:border-text-muted"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-xs font-medium">{tm(m)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === "general" && (
                <div className="flex flex-col gap-5 max-w-md">
                  <div>
                    <h4 className="text-base font-bold text-text flex items-center gap-2 mb-1">
                      <SlidersHorizontal className="w-5 h-5 text-primary" />
                      {t("tabGeneral")}
                    </h4>
                    <p className="text-xs text-text-muted">{t("desc", { roomName })}</p>
                  </div>

                  {/* Rule template — options enumerate the rule registry so
                      new rules show up automatically. */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-text-dim font-medium">{t("ruleTemplateLabel")}</label>
                    <ThemedSelect
                      name="ruleTemplate"
                      value={selectedRuleTemplate}
                      onChange={(e) => setSelectedRuleTemplate(e.target.value)}
                    >
                      {listRules().map(rule => (
                        <option key={rule.id} value={rule.id}>{t(rule.labelKey)}</option>
                      ))}
                    </ThemedSelect>
                    <p className="text-xs text-text-muted">{t("ruleTemplateHint")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer — always visible, shared across tabs */}
          <div className="shrink-0 border-t border-border px-5 py-3.5 bg-surface">
            {error && (
              <div className="bg-danger/10 border border-danger/30 text-text text-sm px-3 py-2 rounded-theme mb-3">
                ⚠️ {error}
              </div>
            )}
            <div className="flex gap-3 justify-end items-center">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 text-sm text-text-muted hover:text-text transition cursor-pointer"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 disabled:opacity-50 text-primary-foreground px-6 py-2.5 rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]"
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </form>
        </>
      )}
    </OverlayShell>
  );
}
