"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeId, ThemeMode, ResolvedMode } from "@/themes/types";
import { THEME_LIST } from "@/themes/types";
import { updateUserThemePreference, updateUserThemeModePreference } from "@/app/actions/theme";

interface ThemeContextValue {
  theme: ThemeId;       // User preferred theme
  activeTheme: ThemeId; // Effective theme (forcedTheme || roomTheme || theme)
  siteTheme: ThemeId;   // Site default (from server)
  forcedTheme: ThemeId | null; // Administrative override (e.g. for admin panel)
  setTheme: (theme: ThemeId) => void;
  setRoomTheme: (theme: ThemeId | null) => void;
  setForcedTheme: (theme: ThemeId | null) => void;
  // Color mode (light/dark) — orthogonal to theme.
  mode: ThemeMode;            // User preferred mode (auto/light/dark)
  activeMode: ThemeMode;      // Effective preference (forcedMode ?? roomMode ?? mode)
  resolvedMode: ResolvedMode; // Concrete light/dark actually applied (auto resolved)
  siteMode: ThemeMode;        // Site default mode (from server)
  forcedMode: ThemeMode | null;
  setMode: (mode: ThemeMode) => void;
  setRoomMode: (mode: ThemeMode | null) => void;
  setForcedMode: (mode: ThemeMode | null) => void;
  themeList: typeof THEME_LIST;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  activeTheme: "default",
  siteTheme: "default",
  forcedTheme: null,
  setTheme: () => {},
  setRoomTheme: () => {},
  setForcedTheme: () => {},
  mode: "auto",
  activeMode: "auto",
  resolvedMode: "light",
  siteMode: "auto",
  forcedMode: null,
  setMode: () => {},
  setRoomMode: () => {},
  setForcedMode: () => {},
  themeList: THEME_LIST,
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** True when the OS/browser reports a dark color-scheme preference. */
function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Resolve an auto/light/dark preference into the concrete mode to apply. */
function resolveMode(pref: ThemeMode, systemDark: boolean): ResolvedMode {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemDark ? "dark" : "light"; // auto — fall back to light when unknown
}

interface ThemeProviderProps {
  children: ReactNode;
  siteTheme?: ThemeId;
  userTheme?: ThemeId | null;
  siteMode?: ThemeMode;
  userMode?: ThemeMode | null;
}

export function ThemeProvider({ children, siteTheme, userTheme, siteMode, userMode }: ThemeProviderProps) {
  // Three-tier priority: user preference > site default
  const initialTheme = userTheme || siteTheme || "default";
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);
  const [roomTheme, setRoomTheme] = useState<ThemeId | null>(null);
  const [forcedTheme, setForcedTheme] = useState<ThemeId | null>(null);

  const initialMode = userMode || siteMode || "auto";
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [roomMode, setRoomMode] = useState<ThemeMode | null>(null);
  const [forcedMode, setForcedMode] = useState<ThemeMode | null>(null);
  // Lazy init reads matchMedia during the hydration render so the very first
  // client render already matches the inline FOUC script (no dark→light flash).
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Load stored user preference on mount (prioritize server-passed userTheme if logged in)
  useEffect(() => {
    if (!userTheme) {
      const stored = localStorage.getItem("trpg-theme") as ThemeId | null;
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeState(stored);
      }
    } else {
      localStorage.setItem("trpg-theme", userTheme);
    }
  }, [userTheme]);

  // Mirror of the above for the color-mode preference.
  useEffect(() => {
    if (!userMode) {
      const stored = localStorage.getItem("trpg-theme-mode") as ThemeMode | null;
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setModeState(stored);
      }
    } else {
      localStorage.setItem("trpg-theme-mode", userMode);
    }
  }, [userMode]);

  // Track the OS color-scheme preference live (drives `auto`). The initial
  // value comes from the lazy useState initializer above; this only subscribes
  // to later changes so a system light/dark flip updates `auto` in real time.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const activeTheme = forcedTheme || roomTheme || theme;
  const activeMode = forcedMode ?? roomMode ?? mode;
  const resolvedMode = resolveMode(activeMode, systemDark);

  // Apply theme + resolved mode to the <html> element.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
  }, [activeTheme]);
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", resolvedMode);
  }, [resolvedMode]);

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
    localStorage.setItem("trpg-theme", newTheme);
    // Persist to server (fire-and-forget)
    updateUserThemePreference(newTheme).catch(() => {});
  };

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("trpg-theme-mode", newMode);
    // Persist to server (fire-and-forget)
    updateUserThemeModePreference(newMode).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{
      theme, activeTheme, siteTheme: siteTheme || "default", forcedTheme,
      setTheme, setRoomTheme, setForcedTheme,
      mode, activeMode, resolvedMode, siteMode: siteMode || "auto", forcedMode,
      setMode, setRoomMode, setForcedMode,
      themeList: THEME_LIST,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
