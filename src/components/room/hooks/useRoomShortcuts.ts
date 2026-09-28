"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useRoomHotkeys } from "@/components/room/hooks/useRoomHotkeys";
import { hotkeyHintStore } from "@/components/room/HotkeyHintToast";
import { TOGGLE_DICE_EVENT, TOGGLE_QUICK_CHECK_EVENT, type RoomHotkeyAction } from "@/lib/ui/hotkeys";
import type { CheckMenuMode } from "@/lib/rules";
import type { OverlayVisibility } from "@/components/room/hooks/useOverlayVisibility";
import type { CheckMode } from "@/components/room/types";

type Toggle = Dispatch<SetStateAction<boolean>>;

/** What each room shortcut does — the room's side of `useRoomHotkeys`. */
export function useRoomShortcuts({
  isHost,
  readOnly,
  checkMenuModes,
  activeTab,
  tabPartners,
  onTabChange,
  toggleInventory,
  toggleSidebar,
  overlaySetters,
  setShowCheckMenu,
  setCheckMode,
}: {
  isHost: boolean;
  readOnly: boolean;
  /** The rule's check modes: several → the dropdown, one → the dialog, none → no-op. */
  checkMenuModes: ReadonlyArray<CheckMenuMode>;
  activeTab: "public" | number;
  /** DM partners in sidebar order, for Alt+↑/↓. */
  tabPartners: { userId: number }[];
  onTabChange: (tab: "public" | number) => void;
  toggleInventory: () => void;
  toggleSidebar: () => void;
  overlaySetters: OverlayVisibility["setters"];
  setShowCheckMenu: Toggle;
  setCheckMode: Dispatch<SetStateAction<CheckMode | null>>;
}) {
  const {
    character: setShowCharacter, notebook: setShowNotebook, events: setShowEvents,
    itemManager: setShowItemManager, timeline: setShowTimeline, hotkeyHelp: setShowHotkeyHelp,
    systemMenu: setShowSystemMenu, aiMenu: setShowAiMenu,
  } = overlaySetters;
  // Alt+↑/↓: cycle through the conversation tabs (public first, then the DM
  // list in sidebar order). Wraps around at both ends.
  const cycleTab = useCallback((dir: 1 | -1) => {
    const order: ("public" | number)[] = ["public", ...tabPartners.map((c) => c.userId)];
    const i = order.indexOf(activeTab);
    onTabChange(order[(Math.max(i, 0) + dir + order.length) % order.length]);
  }, [tabPartners, activeTab, onTabChange]);

  // Room-wide keyboard shortcuts (bindings defined in src/lib/ui/hotkeys.ts).
  useRoomHotkeys({
    isHost,
    readOnly,
    onAction: (action: RoomHotkeyAction) => {
      switch (action) {
        // Opens only: the open panel closes through its own guard (unsaved
        // changes ask first, and the exit animates) — × / backdrop / Esc.
        case "toggle-character": setShowCharacter(true); break;
        case "toggle-inventory": toggleInventory(); break;
        case "toggle-notebook": setShowNotebook((v) => !v); break;
        case "toggle-events": setShowEvents((v) => !v); break;
        case "toggle-sidebar": toggleSidebar(); break;
        case "toggle-dice":
          if (!readOnly) window.dispatchEvent(new CustomEvent(TOGGLE_DICE_EVENT));
          break;
        case "toggle-quick-check":
          // The ChatInput no-ops this when the rule declares no quickCheckPanel.
          if (!readOnly) window.dispatchEvent(new CustomEvent(TOGGLE_QUICK_CHECK_EVENT));
          break;
        case "toggle-check":
          // Mirrors the top-bar button: multi-mode rules get the dropdown,
          // single-mode rules toggle the direct check dialog, no-check rules no-op.
          if (checkMenuModes.length > 1) setShowCheckMenu((v) => !v);
          else if (checkMenuModes.length === 1) setCheckMode((m) => (m === "check" ? null : "check"));
          break;
        case "toggle-item-manager": setShowItemManager((v) => !v); break;
        case "toggle-timeline": setShowTimeline((v) => !v); break;
        case "prev-tab": cycleTab(-1); break;
        case "next-tab": cycleTab(1); break;
        case "help":
          hotkeyHintStore.markSeen();
          setShowHotkeyHelp((v) => !v);
          break;
      }
    },
    // Escape with no overlay mounted: close whichever top-bar dropdown is open.
    onEscape: () => {
      setShowSystemMenu(false);
      setShowAiMenu(false);
      setShowCheckMenu(false);
    },
  });

}
