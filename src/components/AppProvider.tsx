"use client";

import { ThemeProvider } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";
import type { ReactNode } from "react";

interface AppProviderProps {
  roomTheme?: ThemeId | null;
  children: ReactNode;
}

/** Client boundary: wraps ThemeProvider for server-rendered layout */
export function AppProvider({ roomTheme, children }: AppProviderProps) {
  return (
    <ThemeProvider roomTheme={roomTheme}>
      {children}
    </ThemeProvider>
  );
}
