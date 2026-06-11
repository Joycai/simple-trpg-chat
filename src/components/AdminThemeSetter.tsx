"use client";

import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";

interface AdminThemeSetterProps {
  theme: ThemeId;
}

/**
 * Forces the admin panel to display the site-wide theme,
 * ignoring the current user's personal preference.
 */
export function AdminThemeSetter({ theme }: AdminThemeSetterProps) {
  const { setForcedTheme } = useTheme();

  useEffect(() => {
    setForcedTheme(theme);
    return () => {
      setForcedTheme(null);
    };
  }, [theme, setForcedTheme]);

  return null;
}
