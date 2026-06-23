"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe, ShieldAlert, Monitor, Sun, Moon, X, RotateCcw, Save } from "lucide-react";
import { updateSystemConfigBatch } from "@/app/actions/ai";
import { setSiteTheme, setSiteThemeMode } from "@/app/actions/theme";
import { AdminFaviconConfig } from "./AdminFaviconConfig";
import { DEFAULT_SENSITIVE_WORD_GROUPS } from "@/lib/sensitive-words-constants";
import { THEME_LIST, getThemeName, THEME_MODES, type ThemeId, type ThemeMode } from "@/themes/types";

interface AdminConfigClientProps {
  initialTitle: string;
  initialIcp: string;
  initialIcpUrl: string;
  initialFavicon: string;
  initialSensitiveEnabled: boolean;
  initialCustomWords: string[];
  currentTheme: ThemeId;
  currentMode: ThemeMode;
}

const MODE_ICONS: Record<ThemeMode, typeof Monitor> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

export function AdminConfigClient({
  initialTitle,
  initialIcp,
  initialIcpUrl,
  initialFavicon,
  initialSensitiveEnabled,
  initialCustomWords,
  currentTheme,
  currentMode,
}: AdminConfigClientProps) {
  const t = useTranslations("admin");
  const tm = useTranslations("themeMode");
  const locale = useLocale();
  const router = useRouter();

  // Editable text/toggle config (saved together via the bottom bar).
  const [title, setTitle] = useState(initialTitle);
  const [icp, setIcp] = useState(initialIcp);
  const [icpUrl, setIcpUrl] = useState(initialIcpUrl);
  const [enabled, setEnabled] = useState(initialSensitiveEnabled);
  const [customList, setCustomList] = useState<string[]>(initialCustomWords);
  const [wordInput, setWordInput] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  // Theme / mode apply instantly (matches the rest of the app).
  const [theme, setTheme] = useState<ThemeId>(currentTheme);
  const [mode, setMode] = useState<ThemeMode>(currentMode);

  const addWord = () => {
    const w = wordInput.trim();
    if (!w) return;
    if (!customList.includes(w)) setCustomList([...customList, w]);
    setWordInput("");
  };

  const removeWord = (w: string) => setCustomList(customList.filter((x) => x !== w));

  const handleThemeChange = async (id: ThemeId) => {
    setTheme(id);
    await setSiteTheme(id);
    router.refresh();
  };

  const handleModeChange = async (m: ThemeMode) => {
    setMode(m);
    await setSiteThemeMode(m);
    router.refresh();
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      await updateSystemConfigBatch({
        site_title: title.trim(),
        site_icp: icp.trim(),
        site_icp_url: icpUrl.trim(),
        sensitive_words: customList.join("\n"),
        sensitive_words_enabled: enabled ? "1" : "0",
      });
      setMsg(t("saveSuccess"));
      setMsgType("success");
      router.refresh();
    } catch (e) {
      console.error(e);
      setMsg(t("saveFailed"));
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTitle(initialTitle);
    setIcp(initialIcp);
    setIcpUrl(initialIcpUrl);
    setEnabled(initialSensitiveEnabled);
    setCustomList(initialCustomWords);
    setWordInput("");
    setMsg("");
  };

  const inputCls =
    "w-full px-4 py-3 bg-input-bg border border-input-border rounded-theme text-sm text-text placeholder-text-dim outline-none focus:ring-1 focus:ring-primary focus:border-primary transition";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("systemConfig")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("systemConfigSubtitle")}</p>
      </div>

      {/* Row: site info + favicon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-surface theme-border rounded-theme p-6 flex flex-col gap-5">
          <h3 className="font-bold text-text font-theme-display">{t("siteInfoTitle")}</h3>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-muted">{t("siteTitleLabel")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("siteTitlePlaceholder")}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-muted">{t("icpLabel")}</label>
            <input
              type="text"
              value={icp}
              onChange={(e) => setIcp(e.target.value)}
              placeholder={t("icpPlaceholder")}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">{t("icpUrlLabel")}</label>
              <span className="text-[10px] text-text-dim">{t("icpUrlHint")}</span>
            </div>
            <input
              type="text"
              value={icpUrl}
              onChange={(e) => setIcpUrl(e.target.value)}
              placeholder="https://beian.miit.gov.cn/"
              className={`${inputCls} font-theme-mono`}
            />
          </div>
        </section>

        <AdminFaviconConfig initialFavicon={initialFavicon} />
      </div>

      {/* Default theme */}
      <section className="bg-surface theme-border rounded-theme p-6 flex flex-col gap-5">
        <div>
          <h3 className="font-bold text-text font-theme-display">{t("defaultThemeTitle")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("defaultThemeDesc")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs text-text-muted">{t("themeLabel")}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEME_LIST.map((tmeta) => {
              const active = theme === tmeta.id;
              return (
                <button
                  key={tmeta.id}
                  onClick={() => handleThemeChange(tmeta.id)}
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-theme border transition ${
                    active
                      ? "border-primary/60 bg-primary/10 shadow-[var(--theme-glow)]"
                      : "border-border bg-surface-alt hover:bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        active ? "border-primary" : "border-text-dim"
                      }`}
                    >
                      {active && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </span>
                    <span className={`text-sm truncate ${active ? "text-primary font-medium" : "text-text"}`}>
                      {getThemeName(tmeta.id, locale)}
                    </span>
                  </span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-1 ring-inset ring-white/20"
                    style={{ backgroundColor: tmeta.swatch.border }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs text-text-muted">{t("colorModeLabel")}</label>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {THEME_MODES.map((m) => {
              const Icon = MODE_ICONS[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`flex flex-col items-center gap-2 px-4 py-4 rounded-theme border transition ${
                    active
                      ? "border-primary/60 bg-primary/10 text-primary shadow-[var(--theme-glow)]"
                      : "border-border bg-surface-alt text-text-muted hover:bg-surface hover:text-text"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{tm(m)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Sensitive words */}
      <section className="bg-surface theme-border rounded-theme p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-danger/10 text-danger rounded-theme shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-text font-theme-display">{t("sensitiveFilterTitle")}</h3>
              <p className="text-xs text-text-muted mt-0.5">{t("sensitiveFilterDesc")}</p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
              enabled ? "bg-primary shadow-[var(--theme-glow)]" : "bg-surface-alt border border-border"
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>

        {/* Add custom word */}
        <div className="flex gap-3">
          <input
            type="text"
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addWord();
              }
            }}
            placeholder={t("sensitiveAddPlaceholder")}
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={addWord}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium px-5 rounded-theme text-sm transition shrink-0"
          >
            {t("btnAdd")}
          </button>
        </div>

        {/* Custom words chips */}
        {customList.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {customList.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1.5 text-xs bg-surface-alt border border-border text-text px-2.5 py-1.5 rounded-theme"
              >
                {w}
                <button onClick={() => removeWord(w)} className="text-text-dim hover:text-danger transition">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <span className="text-xs text-text-dim ml-1">{t("sensitiveCount", { count: customList.length })}</span>
          </div>
        )}

        {/* System default groups (type summary, words hidden) */}
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Globe className="w-3.5 h-3.5 text-text-dim" />
            {t("systemGroupsLabel")}
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_SENSITIVE_WORD_GROUPS.map((g) => (
              <span
                key={g.key}
                className="inline-flex items-center gap-1.5 text-xs bg-danger/5 border border-danger/20 text-danger-dim px-2.5 py-1.5 rounded-theme"
              >
                {t(`swGroup_${g.key}`)}
                <span className="text-[10px] text-text-dim font-theme-mono">{g.words.length}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer save bar */}
      <div className="flex items-center justify-end gap-4 pb-2">
        {msg && (
          <span className={`text-xs font-semibold ${msgType === "success" ? "text-success" : "text-danger"}`}>
            {msg}
          </span>
        )}
        <button
          onClick={handleReset}
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text font-medium px-4 py-2.5 transition disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          {t("resetBtn")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold px-5 py-2.5 rounded-theme text-sm shadow-[var(--theme-glow)] transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? t("saving") : t("saveConfig")}
        </button>
      </div>
    </div>
  );
}
