"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeId } from "@/themes/types";
import { THEME_LIST } from "@/themes/types";

interface ThemeContextValue {
  theme: ThemeId; // User preferred theme
  activeTheme: ThemeId; // Effective theme (roomTheme || theme)
  setTheme: (theme: ThemeId) => void;
  setRoomTheme: (theme: ThemeId | null) => void;
  themeList: typeof THEME_LIST;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  activeTheme: "default",
  setTheme: () => {},
  setRoomTheme: () => {},
  themeList: THEME_LIST,
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: ThemeId;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme || "default");
  const [roomTheme, setRoomTheme] = useState<ThemeId | null>(null);

  // Load stored user preference on mount (overrides site default)
  useEffect(() => {
    const stored = localStorage.getItem("trpg-theme") as ThemeId | null;
    if (stored) {
      setThemeState(stored);
    }
  }, []);

  const activeTheme = roomTheme || theme;

  // Apply theme to <html> data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
  }, [activeTheme]);

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
    localStorage.setItem("trpg-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, activeTheme, setTheme, setRoomTheme, themeList: THEME_LIST }}>
      {children}
    </ThemeContext.Provider>
  );
}

