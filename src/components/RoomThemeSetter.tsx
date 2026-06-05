"use client";

import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";

interface RoomThemeSetterProps {
  theme: ThemeId;
}

/** Sets data-theme on <html> for room-specific theming */
export function RoomThemeSetter({ theme }: RoomThemeSetterProps) {
  const { setRoomTheme } = useTheme();

  useEffect(() => {
    setRoomTheme(theme);
    return () => {
      setRoomTheme(null);
    };
  }, [theme, setRoomTheme]);

  return null;
}
