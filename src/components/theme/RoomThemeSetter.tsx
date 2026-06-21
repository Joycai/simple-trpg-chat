"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeId, ThemeMode } from "@/themes/types";

interface RoomThemeSetterProps {
  roomId: number;
  theme: ThemeId;
  mode: ThemeMode;
}

/** Sets data-theme + data-mode on <html> for room-specific theming */
export function RoomThemeSetter({ roomId, theme, mode }: RoomThemeSetterProps) {
  const { setRoomTheme, setRoomMode } = useTheme();

  useEffect(() => {
    setRoomTheme(theme);
    setRoomMode(mode);
    try {
      window.sessionStorage.setItem("room-theme-" + roomId, theme);
      window.sessionStorage.setItem("room-mode-" + roomId, mode);
    } catch {}
    return () => {
      setRoomTheme(null);
      setRoomMode(null);
    };
  }, [roomId, theme, mode, setRoomTheme, setRoomMode]);

  return null;
}
