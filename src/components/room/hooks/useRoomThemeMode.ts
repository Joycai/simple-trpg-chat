"use client";

import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { parseTimelinePayload, resolvedModeFromDivider } from "@/lib/messaging/timeline-payload";
import type { ThemeMode, ResolvedMode } from "@/themes/types";
import type { Message, Room } from "@/components/room/types";

/**
 * Publishes the room's light/dark mode to the theme context (and the pre-paint
 * cache) for as long as the room is mounted.
 */
export function useRoomThemeMode({
  room,
  messages,
  initialTimelineMode,
}: {
  room: Room;
  messages: Message[];
  /** Server-resolved from the room's latest divider, for "timeline" mode. */
  initialTimelineMode?: ResolvedMode;
}) {
  // Room display mode — the room (through this hook) is the single owner of
  // the theme context's roomMode (RoomThemeSetter owns only the theme). Normally this is the room's
  // configured auto/light/dark. When themeMode is "timeline", light/dark instead
  // follows the most recent timeline divider (night → dark, morning/afternoon →
  // light). The latest divider is the max-id one in the loaded window; if none is
  // loaded we fall back to the server-resolved initial (the true latest may
  // predate the window).
  const { setRoomMode } = useTheme();
  const followsTimeline = room.themeMode === "timeline";
  // Mode resolved from the newest divider inside the loaded window; null when
  // the window holds no divider (never loaded, or trimmed out by the
  // message-window cap).
  const scannedDividerMode = useMemo<ThemeMode | null>(() => {
    if (!followsTimeline) return null;
    let latest: Message | null = null;
    for (const m of messages) {
      if (m.type === "system" && m.systemKind === "timeline-divider" && (!latest || m.id > latest.id)) {
        latest = m;
      }
    }
    if (!latest) return null;
    return resolvedModeFromDivider(parseTimelinePayload(latest.diceDetail)) ?? "light";
  }, [followsTimeline, messages]);
  // Last divider-resolved mode ever seen this session (render-time derived
  // state, same pattern as useLivePlayers' re-seed). Needed because the
  // message-window cap can trim the divider row itself out of `messages` —
  // without this, the mode would silently snap back to the page-load initial.
  const [lastDividerMode, setLastDividerMode] = useState<ThemeMode | null>(null);
  if (scannedDividerMode !== null && scannedDividerMode !== lastDividerMode) {
    setLastDividerMode(scannedDividerMode);
  }
  const effectiveRoomMode: ThemeMode = !followsTimeline
    ? (room.themeMode as ThemeMode) || "auto"
    : scannedDividerMode ?? lastDividerMode ?? initialTimelineMode ?? "light";

  useEffect(() => {
    setRoomMode(effectiveRoomMode);
    // Cache for the pre-paint FOUC script (src/app/layout.tsx) on next navigation.
    try { window.sessionStorage.setItem("room-mode-" + room.id, effectiveRoomMode); } catch {}
    return () => setRoomMode(null);
  }, [effectiveRoomMode, room.id, setRoomMode]);
}
