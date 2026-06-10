"use client";

import { ThemeProvider } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";
import type { ReactNode } from "react";

interface AppProviderProps {
  children: ReactNode;
  initialTheme?: ThemeId;
}

/** Client boundary: wraps ThemeProvider for server-rendered layout */
export function AppProvider({ children, initialTheme }: AppProviderProps) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      {children}
    </ThemeProvider>
  );
}
