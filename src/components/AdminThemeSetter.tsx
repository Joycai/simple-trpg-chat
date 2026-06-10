"use client";

import { useEffect } from "react";
import type { ThemeId } from "@/themes/types";

interface AdminThemeSetterProps {
  theme: ThemeId;
}

/**
 * Forces the admin panel to display the site-wide theme,
 * ignoring the current user's personal preference.
 */
export function AdminThemeSetter({ theme }: AdminThemeSetterProps) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      // Restore user preference on unmount
      const stored = localStorage.getItem("trpg-theme") as ThemeId | null;
      if (stored) {
        document.documentElement.setAttribute("data-theme", stored);
      }
    };
  }, [theme]);

  return null;
}
