"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeId, ThemeMode } from "@/themes/types";

interface LoginThemeSetterProps {
  theme: ThemeId;
  mode: ThemeMode;
}

/**
 * Forces the login page to display the site-wide (admin-configured) theme and
 * color mode, ignoring any personal preference cached in localStorage. Mirrors
 * AdminThemeSetter — activeTheme/activeMode prioritise the forced values.
 */
export function LoginThemeSetter({ theme, mode }: LoginThemeSetterProps) {
  const { setForcedTheme, setForcedMode } = useTheme();

  useEffect(() => {
    setForcedTheme(theme);
    setForcedMode(mode);
    return () => {
      setForcedTheme(null);
      setForcedMode(null);
    };
  }, [theme, mode, setForcedTheme, setForcedMode]);

  return null;
}
