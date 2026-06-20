"use client";

import { useState } from "react";
import { Palette, SlidersHorizontal, X } from "lucide-react";
import { updateRoomSettingsAction } from "@/app/actions/room";
import { THEME_LIST, getThemeName, getThemeDesc } from "@/themes/types";
import type { ThemeId } from "@/themes/types";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useOverlayTransition } from "@/lib/useOverlayTransition";

interface RoomSettingsProps {
  roomId: number;
  roomName: string;
  currentTheme: ThemeId;
  currentDiceRules?: string;
  currentRuleTemplate?: string;
  onClose: () => void;
}

type SettingsTab = "theme" | "general";

export function RoomSettings({ roomId, roomName, currentTheme, currentDiceRules, currentRuleTemplate, onClose }: RoomSettingsProps) {
  const t = useTranslations("roomSettings");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const [tab, setTab] = useState<SettingsTab>("theme");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(currentTheme);
  const [selectedDiceRules, setSelectedDiceRules] = useState<string>(currentDiceRules || "basic");
  const [selectedRuleTemplate, setSelectedRuleTemplate] = useState<string>(currentRuleTemplate || "basic");
  const router = useRouter();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("theme", selectedTheme);
      formData.set("diceRules", selectedDiceRules);
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${backdropClass}`} onClick={close}>
      <div
        className={`bg-surface border border-border rounded-theme theme-border shadow-2xl w-full max-w-md md:max-w-2xl mx-4 h-[85vh] md:h-[34rem] max-h-[90vh] overflow-hidden flex flex-col ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <h3 className="font-bold text-lg text-text">{t("title")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text p-1 hover:bg-surface-alt rounded transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
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
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs md:text-sm font-medium transition-all duration-150 rounded-theme md:w-full text-left shrink-0 cursor-pointer ${
                      isActive
                        ? "text-primary bg-primary/10 border-b-2 md:border-b-0 md:border-l-4 border-primary font-semibold"
                        : "text-text-muted hover:text-text hover:bg-surface-alt/50"
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
                    {THEME_LIST.map((theme) => (
                      <label
                        key={theme.id}
                        className={`flex items-center gap-3 p-3 rounded-theme border cursor-pointer transition ${
                          selectedTheme === theme.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-text-muted"
                        }`}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={theme.id}
                          checked={selectedTheme === theme.id}
                          onChange={() => setSelectedTheme(theme.id as ThemeId)}
                          className="accent-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text truncate">{getThemeName(theme.id, locale)}</div>
                          <div className="text-xs text-text-dim mt-0.5 line-clamp-2">{getThemeDesc(theme.id, locale)}</div>
                        </div>
                        {/* Theme preview dot — colors come from the theme registry */}
                        <div
                          className="w-6 h-6 rounded-full border-[3px] shrink-0"
                          style={{ backgroundColor: theme.swatch.bg, borderColor: theme.swatch.border }}
                        />
                      </label>
                    ))}
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

                  {/* Dice rules */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-text-dim font-medium">{t("diceRulesLabel")}</label>
                    <select
                      name="diceRules"
                      value={selectedDiceRules}
                      onChange={(e) => setSelectedDiceRules(e.target.value)}
                      className="p-2.5 border border-input-border bg-input-bg rounded-theme outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm"
                    >
                      <option value="basic">{t("diceRulesBasic")}</option>
                      <option value="coc7th">{t("diceRulesCoc7th")}</option>
                    </select>
                    <p className="text-xs text-text-muted">{t("diceRulesCoc7thHint")}</p>
                  </div>

                  {/* Rule template */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-text-dim font-medium">{t("ruleTemplateLabel")}</label>
                    <select
                      name="ruleTemplate"
                      value={selectedRuleTemplate}
                      onChange={(e) => setSelectedRuleTemplate(e.target.value)}
                      className="p-2.5 border border-input-border bg-input-bg rounded-theme outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm"
                    >
                      <option value="basic">{t("ruleTemplateBasic")}</option>
                      <option value="coc7th">{t("ruleTemplateCoc7th")}</option>
                    </select>
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
                className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground px-6 py-2 rounded-theme font-bold text-sm transition cursor-pointer"
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
