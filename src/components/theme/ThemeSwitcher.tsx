"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Palette, Check } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useLocale, useTranslations } from "next-intl";
import { getThemeName, getThemeDesc } from "@/themes/types";

export function ThemeSwitcher() {
  const { theme, setTheme, themeList } = useTheme();
  const t = useTranslations("theme");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = themeList.find((tm) => tm.id === theme) ?? themeList[0];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("switch")}
        className="flex items-center gap-2 h-9 px-2.5 rounded-theme border border-border bg-surface-alt text-text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
      >
        <Palette className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline text-sm max-w-[7rem] truncate text-text">
          {getThemeName(active.id, locale)}
        </span>
        <span
          className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
          style={{ backgroundColor: active.swatch.bg, borderColor: active.swatch.border }}
        />
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="overlay-pop absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-theme shadow-lg z-50 overflow-hidden"
          style={{ transformOrigin: "top right" }}
        >
          <div className="px-3 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            {t("label")}
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {themeList.map((tm) => {
              const isActive = tm.id === theme;
              return (
                <button
                  key={tm.id}
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => { setTheme(tm.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer ${
                    isActive ? "bg-primary/10" : "hover:bg-surface-alt"
                  }`}
                >
                  {/* Theme preview dot — colors come from the theme registry */}
                  <span
                    className="w-6 h-6 rounded-full border-[3px] shrink-0"
                    style={{ backgroundColor: tm.swatch.bg, borderColor: tm.swatch.border }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-medium truncate ${isActive ? "text-primary" : "text-text"}`}>
                      {getThemeName(tm.id, locale)}
                    </span>
                    <span className="block text-xs text-text-dim truncate">{getThemeDesc(tm.id, locale)}</span>
                  </span>
                  {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
