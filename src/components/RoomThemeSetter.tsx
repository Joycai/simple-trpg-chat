"use client";

import { useEffect } from "react";
import type { ThemeId } from "@/themes/types";

interface RoomThemeSetterProps {
  theme: ThemeId;
}

/** Sets data-theme on <html> for room-specific theming */
export function RoomThemeSetter({ theme }: RoomThemeSetterProps) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      // Revert to default when leaving room
      const stored = localStorage.getItem("trpg-theme") as ThemeId | null;
      document.documentElement.setAttribute("data-theme", stored || "default");
    };
  }, [theme]);

  return null;
}
