"use client";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import type { ThemeId, ThemeMode } from "@/themes/types";
import type { ReactNode } from "react";

interface AppProviderProps {
  children: ReactNode;
  siteTheme?: ThemeId;
  userTheme?: ThemeId | null;
  siteMode?: ThemeMode;
  userMode?: ThemeMode | null;
}

/** Client boundary: wraps ThemeProvider for server-rendered layout */
export function AppProvider({ children, siteTheme, userTheme, siteMode, userMode }: AppProviderProps) {
  return (
    <ThemeProvider siteTheme={siteTheme} userTheme={userTheme} siteMode={siteMode} userMode={userMode}>
      {children}
    </ThemeProvider>
  );
}
