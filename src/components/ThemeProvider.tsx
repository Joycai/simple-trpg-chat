"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeId } from "@/themes/types";
import { THEME_LIST } from "@/themes/types";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themeList: typeof THEME_LIST;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
  themeList: THEME_LIST,
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  /** Theme from room config (overrides user preference) */
  roomTheme?: ThemeId | null;
  children: ReactNode;
}

export function ThemeProvider({ roomTheme, children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeId>("default");

  // Determine effective theme: room theme > stored preference > default
  useEffect(() => {
    if (roomTheme) {
      setThemeState(roomTheme);
    } else {
      const stored = localStorage.getItem("trpg-theme") as ThemeId | null;
      setThemeState(stored || "default");
    }
  }, [roomTheme]);

  // Apply theme to <html> data-theme attribute (only when NOT in a room)
  useEffect(() => {
    if (!roomTheme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("trpg-theme", theme);
    }
  }, [theme, roomTheme]);

  const setTheme = (newTheme: ThemeId) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeList: THEME_LIST }}>
      {children}
    </ThemeContext.Provider>
  );
}
