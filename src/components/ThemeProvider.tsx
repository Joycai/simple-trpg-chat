"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeId } from "@/themes/types";
import { THEME_LIST } from "@/themes/types";
import { updateUserThemePreference } from "@/app/actions/theme";

interface ThemeContextValue {
  theme: ThemeId;       // User preferred theme
  activeTheme: ThemeId; // Effective theme (forcedTheme || roomTheme || theme)
  siteTheme: ThemeId;   // Site default (from server)
  forcedTheme: ThemeId | null; // Administrative override (e.g. for admin panel)
  setTheme: (theme: ThemeId) => void;
  setRoomTheme: (theme: ThemeId | null) => void;
  setForcedTheme: (theme: ThemeId | null) => void;
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
  themeList: THEME_LIST,
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  siteTheme?: ThemeId;
  userTheme?: ThemeId | null;
}

export function ThemeProvider({ children, siteTheme, userTheme }: ThemeProviderProps) {
  // Three-tier priority: user preference > site default
  const initialTheme = userTheme || siteTheme || "default";
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);
  const [roomTheme, setRoomTheme] = useState<ThemeId | null>(null);
  const [forcedTheme, setForcedTheme] = useState<ThemeId | null>(null);

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

  const activeTheme = forcedTheme || roomTheme || theme;

  // Apply theme to <html> data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
  }, [activeTheme]);

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
    localStorage.setItem("trpg-theme", newTheme);
    // Persist to server (fire-and-forget)
    updateUserThemePreference(newTheme).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{
      theme, activeTheme, siteTheme: siteTheme || "default", forcedTheme,
      setTheme, setRoomTheme, setForcedTheme, themeList: THEME_LIST,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
