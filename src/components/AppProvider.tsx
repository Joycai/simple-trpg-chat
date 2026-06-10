"use client";

import { ThemeProvider } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";
import type { ReactNode } from "react";

interface AppProviderProps {
  children: ReactNode;
  siteTheme?: ThemeId;
  userTheme?: ThemeId | null;
}

/** Client boundary: wraps ThemeProvider for server-rendered layout */
export function AppProvider({ children, siteTheme, userTheme }: AppProviderProps) {
  return (
    <ThemeProvider siteTheme={siteTheme} userTheme={userTheme}>
      {children}
    </ThemeProvider>
  );
}
