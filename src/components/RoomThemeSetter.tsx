"use client";

import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import type { ThemeId } from "@/themes/types";

interface RoomThemeSetterProps {
  roomId: number;
  theme: ThemeId;
}

/** Sets data-theme on <html> for room-specific theming */
export function RoomThemeSetter({ roomId, theme }: RoomThemeSetterProps) {
  const { setRoomTheme } = useTheme();

  useEffect(() => {
    setRoomTheme(theme);
    try {
      window.sessionStorage.setItem("room-theme-" + roomId, theme);
    } catch (e) {}
    return () => {
      setRoomTheme(null);
    };
  }, [roomId, theme, setRoomTheme]);

  return null;
}
