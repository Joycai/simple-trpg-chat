"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemeId } from "@/themes/types";

interface RoomThemeSetterProps {
  roomId: number;
  theme: ThemeId;
}

/**
 * Sets data-theme on <html> for room-specific theming. The color mode (data-mode)
 * is owned by RoomClient — it may follow the room's timeline dividers — so it is
 * intentionally not set here to keep a single writer of the theme context's
 * roomMode.
 */
export function RoomThemeSetter({ roomId, theme }: RoomThemeSetterProps) {
  const { setRoomTheme } = useTheme();

  useEffect(() => {
    setRoomTheme(theme);
    try {
      window.sessionStorage.setItem("room-theme-" + roomId, theme);
    } catch {}
    return () => {
      setRoomTheme(null);
    };
  }, [roomId, theme, setRoomTheme]);

  return null;
}
