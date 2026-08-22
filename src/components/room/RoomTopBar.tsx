"use client";

import { useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useClickOutside } from "@/lib/useClickOutside";
import { useRoomBgIntensity, setRoomBgIntensity } from "@/components/room/hooks/useRoomBgIntensity";
import { formatHotkey } from "@/lib/hotkeys";
import type { Room } from "@/components/room/types";
import type { CheckMenuMode } from "@/lib/rules";
import { useHostLabel } from "@/components/shared/host-label";

type CheckMode = null | "check" | "psychology" | "sancheck";

/**
 * Static UI mapping for each check-menu mode. The rule's capabilities
 * say which modes to expose; this map says how each one is rendered.
 * Adding a new mode means adding a row here AND in the closed VisualGrade
 * vocabulary in `@/lib/rules/types.ts`.
 */
const CHECK_MODE_UI: Record<CheckMenuMode, {
  Icon: typeof Icons.Target;
  tone: "primary" | "ai" | "accent";
  titleKey: string;
  descKey: string;
}> = {
  check:      { Icon: Icons.Target,  tone: "primary", titleKey: "btnCheckNormal", descKey: "btnCheckNormalDesc" },
  psychology: { Icon: Icons.Eye,     tone: "ai",      titleKey: "btnPsyCheck",    descKey: "btnPsyCheckDesc" },
  sancheck:   { Icon: Icons.Droplet, tone: "accent",  titleKey: "btnSanCheck",    descKey: "btnSanCheckDesc" },
};

// Thin vertical rule used to separate logical button groups in the top bar.
function ToolDivider() {
  return <div className="hidden sm:block w-px h-5 bg-border self-center shrink-0" aria-hidden />;
}

interface RoomTopBarProps {
  room: Room;
  isHost: boolean;
  nickname: string;
  status: "connecting" | "connected" | "error";
  /**
   * Check-menu modes exposed by the active rule's capabilities. When > 1, the
   * TopBar renders a dropdown; when exactly 1, a single direct button. Comes
   * straight from `rule.capabilities.checkMenuModes`.
   */
  checkMenuModes: ReadonlyArray<CheckMenuMode>;
  /** True while the host has a background set — gates the intensity slider in the gear menu. */
  hasBackground: boolean;
  playerCount: number;
  /** Live count of members currently online (non-bot, incl. self) — the "X 在线" label. */
  onlineCount: number;
  botCount: number;
  // Sidebar
  sidebarCollapsed: boolean;
  totalUnread: number;
  onToggleSidebar: () => void;
  // Inline room-name editing
  editingRoomName: boolean;
  roomNameDraft: string;
  savingRoomName: boolean;
  setRoomNameDraft: Dispatch<SetStateAction<string>>;
  setEditingRoomName: Dispatch<SetStateAction<boolean>>;
  onSaveRoomName: () => void;
  // Panel toggles
  showCharacter: boolean;
  setShowCharacter: Dispatch<SetStateAction<boolean>>;
  // Gentle nudge dot when the current user's character sheet isn't set up yet
  // (structured-sheet rules only; see RoomClient).
  characterHint?: boolean;
  showInventory: boolean;
  unreadItems: number;
  onToggleInventory: () => void;
  showNotebook: boolean;
  setShowNotebook: Dispatch<SetStateAction<boolean>>;
  // Events (事件) — player-facing panel toggle + unread badge.
  showEvents: boolean;
  setShowEvents: Dispatch<SetStateAction<boolean>>;
  unreadEvents: number;
  checkMode: CheckMode;
  setCheckMode: Dispatch<SetStateAction<CheckMode>>;
  showCheckMenu: boolean;
  setShowCheckMenu: Dispatch<SetStateAction<boolean>>;
  showItemManager: boolean;
  setShowItemManager: Dispatch<SetStateAction<boolean>>;
  // Host event management panel (opened from the 道具/事件 dropdown).
  setShowEventManage: Dispatch<SetStateAction<boolean>>;
  showTimeline: boolean;
  setShowTimeline: Dispatch<SetStateAction<boolean>>;
  showAiMenu: boolean;
  setShowAiMenu: Dispatch<SetStateAction<boolean>>;
  setShowAiImport: Dispatch<SetStateAction<boolean>>;
  setShowBotManager: Dispatch<SetStateAction<boolean>>;
  showSystemMenu: boolean;
  setShowSystemMenu: Dispatch<SetStateAction<boolean>>;
  setShowMembers: Dispatch<SetStateAction<boolean>>;
  setShowRoomInfo: Dispatch<SetStateAction<boolean>>;
  setShowExport: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowUserSettings: Dispatch<SetStateAction<boolean>>;
  setShowHotkeyHelp: Dispatch<SetStateAction<boolean>>;
}

/**
 * External store for the 事件管理 "新" badge. Persisted in localStorage and
 * read via useSyncExternalStore so there's no setState-in-effect (which the
 * lint config treats as a build error) and no hydration flash — the server
 * snapshot is always "seen" (badge hidden). `markSeen` notifies same-tab
 * subscribers directly, since the native `storage` event only fires cross-tab.
 */
const EVENT_BADGE_KEY = "strpg:event-manage-badge-seen";
const eventBadgeStore = {
  listeners: new Set<() => void>(),
  subscribe(cb: () => void) {
    eventBadgeStore.listeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      eventBadgeStore.listeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  },
  getSnapshot(): boolean {
    try { return localStorage.getItem(EVENT_BADGE_KEY) === "1"; } catch { return true; }
  },
  getServerSnapshot(): boolean { return true; },
  markSeen() {
    try { localStorage.setItem(EVENT_BADGE_KEY, "1"); } catch { /* ignore */ }
    eventBadgeStore.listeners.forEach((l) => l());
  },
};

export function RoomTopBar({
  room,
  isHost,
  nickname,
  status,
  checkMenuModes,
  hasBackground,
  playerCount,
  onlineCount,
  botCount,
  sidebarCollapsed,
  totalUnread,
  onToggleSidebar,
  editingRoomName,
  roomNameDraft,
  savingRoomName,
  setRoomNameDraft,
  setEditingRoomName,
  onSaveRoomName,
  showCharacter,
  setShowCharacter,
  characterHint = false,
  showInventory,
  unreadItems,
  onToggleInventory,
  showNotebook,
  setShowNotebook,
  showEvents,
  setShowEvents,
  unreadEvents,
  checkMode,
  setCheckMode,
  showCheckMenu,
  setShowCheckMenu,
  showItemManager,
  setShowItemManager,
  setShowEventManage,
  showTimeline,
  setShowTimeline,
  showAiMenu,
  setShowAiMenu,
  setShowAiImport,
  setShowBotManager,
  showSystemMenu,
  setShowSystemMenu,
  setShowMembers,
  setShowRoomInfo,
  setShowExport,
  setShowSettings,
  setShowUserSettings,
  setShowHotkeyHelp,
}: RoomTopBarProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
  const ts = useTranslations("userSettings");
  const tb = useTranslations("roomBackground");
  const hostLabel = useHostLabel();
  const bgIntensity = useRoomBgIntensity();

  // Uniform sizing for every top-bar control, so heights and edges line up
  // regardless of group/color. Per-button classes only add the color variant.
  // Icon-only control used by the common (host + player) toolbar group.
  const iconBtn = "relative flex items-center justify-center w-9 h-9 rounded-theme border transition active:scale-95 cursor-pointer";
  const iconActive = "bg-primary/10 text-primary border-primary/40";
  const iconIdle = "text-text-muted hover:text-text hover:bg-surface-alt border-transparent";
  // Common (personal) group — 角色/背包/记事本/成员 share one cool "nav" identity,
  // so the cluster reads as a unit and stays distinct from both the neutral gear
  // and the host group's warm per-function colors (--theme-nav, themeable).
  const iconNavActive = "bg-nav/15 text-nav border-nav/45";
  const iconNavIdle = "text-nav/85 hover:text-nav hover:bg-nav/10 border-transparent";
  // Host-only variants — accent (gold) for 检定, primary (vermilion) for 道具,
  // ai (violet) for Bot/AI. 检定 and 道具 must read as distinct colors.
  const iconAccentActive = "bg-accent/15 text-accent border-accent/50";
  const iconAccentIdle = "text-accent/80 hover:text-accent hover:bg-accent/10 border-transparent";
  const iconPrimaryActive = "bg-primary/15 text-primary border-primary/50";
  const iconPrimaryIdle = "text-primary/80 hover:text-primary hover:bg-primary/10 border-transparent";
  const iconAiActive = "bg-ai/15 text-ai border-ai/50";
  const iconAiIdle = "text-ai/80 hover:text-ai hover:bg-ai/10 border-transparent";

  // Outside-click close for the top-bar dropdowns. A document listener works
  // even though the rainglass header's backdrop-filter clips `fixed` backdrops.
  const checkRef = useRef<HTMLDivElement>(null);
  const aiRef = useRef<HTMLDivElement>(null);
  const sysRef = useRef<HTMLDivElement>(null);
  // The 道具/事件 dropdown is self-contained (local open state), like the AI menu.
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const [showItemMenu, setShowItemMenu] = useState(false);
  // "新" badge on the 事件管理 row auto-dismisses once the host opens it.
  const eventBadgeSeen = useSyncExternalStore(
    eventBadgeStore.subscribe,
    eventBadgeStore.getSnapshot,
    eventBadgeStore.getServerSnapshot,
  );
  const markEventBadgeSeen = () => eventBadgeStore.markSeen();
  useClickOutside(checkRef, () => setShowCheckMenu(false), showCheckMenu);
  useClickOutside(aiRef, () => setShowAiMenu(false), showAiMenu);
  useClickOutside(sysRef, () => setShowSystemMenu(false), showSystemMenu);
  useClickOutside(itemMenuRef, () => setShowItemMenu(false), showItemMenu);

  return (
    <header className="bg-header-bg border-b border-header-border shadow-sm px-4 py-2 sm:py-3 shrink-0 z-20 relative">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-stretch md:items-center">
        <div className="flex items-center gap-3 min-w-0">
          {/* Room identity — name + #id + online count */}
          <div className="flex items-center gap-2.5 min-w-0">
            {isHost && editingRoomName ? (
              <input
                value={roomNameDraft}
                onChange={(e) => setRoomNameDraft(e.target.value)}
                onBlur={onSaveRoomName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onSaveRoomName(); }
                  else if (e.key === "Escape") { setRoomNameDraft(room.name); setEditingRoomName(false); }
                }}
                maxLength={100}
                autoFocus
                disabled={savingRoomName}
                className="text-lg font-bold text-text leading-tight bg-input-bg border border-input-border rounded px-1.5 py-0.5 outline-none focus:ring-[3px] focus:ring-primary/[0.18] max-w-[12rem] disabled:opacity-60"
              />
            ) : (
              <div
                className={`group flex items-center gap-1.5 min-w-0 ${isHost ? "cursor-pointer" : ""}`}
                onClick={isHost ? () => { setRoomNameDraft(room.name); setEditingRoomName(true); } : undefined}
                title={isHost ? t("editNameTooltip") : room.name}
              >
                <h2 className={`text-lg font-bold text-text leading-tight truncate max-w-[8rem] sm:max-w-[14rem] font-theme-display ${isHost ? "group-hover:text-primary transition" : ""}`}>
                  {room.name}
                </h2>
                {isHost && <Icons.Pencil className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-70 transition shrink-0" />}
              </div>
            )}
            <span className="text-xs font-mono text-text-dim shrink-0">{tn("roomId", { id: room.id })}</span>
            {/* Online count + connection dot */}
            <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-xs text-text-muted">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-accent animate-pulse' : 'bg-danger'}`} title={status} />
              {t("onlineCount", { count: onlineCount })}
            </span>
            {room.frozen && (
              <span className="inline-flex items-center gap-1 text-[10px] bg-text-dim/15 text-text-dim px-1.5 py-0.5 rounded font-bold uppercase tracking-wider select-none shrink-0">
                <Icons.Lock className="w-3 h-3" />{isHost ? t("frozenBadgeHost") : t("frozenBadge")}
              </span>
            )}
          </div>
          {isHost && (
            <span className="md:hidden text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider select-none self-center">
              {hostLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {/* Group 1: common controls (host + player) — icon bar */}
          <button
            onClick={() => setShowCharacter(!showCharacter)}
            className={`${iconBtn} ${showCharacter ? iconNavActive : iconNavIdle}`}
            title={`${t("tooltipCharacter")} · ${nickname}${characterHint ? ` · ${t("charHintUnset")}` : ""} (${formatHotkey("KeyC")})`}
            aria-pressed={showCharacter}
          >
            <Icons.User className="w-[18px] h-[18px]" />
            {characterHint && (
              <span
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary shadow-[var(--theme-glow)]"
                aria-hidden="true"
              />
            )}
          </button>
          <button
            onClick={onToggleInventory}
            className={`${iconBtn} ${showInventory ? iconNavActive : iconNavIdle}`}
            title={`${t("tooltipInventory")} (${formatHotkey("KeyB")})`}
            aria-pressed={showInventory}
          >
            <Icons.Package className="w-[18px] h-[18px]" />
            {unreadItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadItems > 9 ? "9+" : unreadItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowNotebook(!showNotebook)}
            className={`${iconBtn} ${showNotebook ? iconNavActive : iconNavIdle}`}
            title={`${t("tooltipNotebook")} (${formatHotkey("KeyN")})`}
            aria-pressed={showNotebook}
          >
            <Icons.NotebookPen className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`${iconBtn} ${showEvents ? iconAccentActive : iconAccentIdle}`}
            title={`${t("tooltipEvents")} (${formatHotkey("KeyV")})`}
            aria-pressed={showEvents}
          >
            <Icons.Flag className="w-[18px] h-[18px]" />
            {unreadEvents > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadEvents > 9 ? "9+" : unreadEvents}
              </span>
            )}
          </button>
          <button
            onClick={onToggleSidebar}
            className={`${iconBtn} ${!sidebarCollapsed ? iconNavActive : iconNavIdle}`}
            title={`${sidebarCollapsed ? t("tooltipExpandDm") : t("tooltipCollapseSidebar")} (${formatHotkey("KeyM")})`}
            aria-pressed={!sidebarCollapsed}
          >
            <Icons.Users className="w-[18px] h-[18px]" />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                {totalUnread > 9 ? "9+" : totalUnread}
              </span>
            )}
          </button>

          {/* Group 2: 系统菜单 (gear) — common */}
          <ToolDivider />
          <div className="relative" ref={sysRef}>
            <button
              onClick={() => { setShowSystemMenu(!showSystemMenu); setShowAiMenu(false); }}
              className={`${iconBtn} ${showSystemMenu ? iconActive : iconIdle}`}
              title={t("tooltipSystem")}
              aria-pressed={showSystemMenu}
            >
              <Icons.Settings className="w-[18px] h-[18px]" />
            </button>
            {showSystemMenu && (
              <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[160px] z-30 overlay-pop"
                style={{ transformOrigin: "top right" }}
                onClick={() => setShowSystemMenu(false)}>
                <button onClick={() => { setShowMembers(true); }}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                  <Icons.Users className="w-4 h-4" /> {t("menuMembers")} <span className="ml-auto text-xs text-text-muted">{playerCount + botCount}</span>
                </button>
                <button onClick={() => { setShowRoomInfo(true); }}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                  <Icons.Info className="w-4 h-4" /> {t("menuInfo")}
                </button>

                {isHost && (
                  <div className="border-t border-border mt-1 pt-1">
                    <button onClick={() => { setShowExport(true); }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                      <Icons.Download className="w-4 h-4" /> {t("menuExport")}
                    </button>
                    <button onClick={() => { setShowSettings(true); }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                      <Icons.Settings className="w-4 h-4" /> {t("menuSettings")}
                    </button>
                  </div>
                )}

                {/* Personal Settings / Dashboard */}
                <div className="border-t border-border mt-1 pt-1">
                  <button onClick={() => { setShowUserSettings(true); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                    <Icons.User className="w-4 h-4" /> {ts("title")}
                  </button>
                  <button onClick={() => { setShowHotkeyHelp(true); }}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                    <Icons.Keyboard className="w-4 h-4" /> {t("menuHotkeys")} <span className="ml-auto text-xs text-text-muted font-mono">{formatHotkey("Slash")}</span>
                  </button>
                  {/* Player-local background intensity — only offered while the host
                      has a background set. stopPropagation keeps the wrapper's
                      close-on-click from firing while dragging the slider. */}
                  {hasBackground && (
                    <div className="px-4 pt-1.5 pb-1.5 w-60" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5 text-sm text-text">
                        <Icons.Image className="w-4 h-4 shrink-0" />
                        <span>{tb("intensityLabel")}</span>
                        <span className="ml-auto text-xs text-text-muted font-mono">
                          {bgIntensity === 0 ? tb("intensityOff") : `${bgIntensity}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={bgIntensity}
                        onChange={(e) => setRoomBgIntensity(parseInt(e.target.value, 10))}
                        className="w-full accent-primary cursor-pointer mt-2"
                        aria-label={tb("intensityLabel")}
                      />
                      <p className="text-[11px] text-text-dim mt-1 leading-snug">{tb("intensityHint")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Group 3: Host 专属功能 — 主持人标识 + 检定 + 道具管理 + AI */}
          {isHost && (
            <>
              <ToolDivider />
              <span className="inline-flex items-center h-9 px-2.5 rounded-theme border border-accent/50 text-accent text-xs font-bold tracking-wide select-none shrink-0">
                {hostLabel}
              </span>
              {checkMenuModes.length > 1 ? (
                /* Multi-mode rule (e.g. COC): a 检定 dropdown enumerating the
                   rule's exposed modes. Each row uses the static UI mapping
                   from CHECK_MODE_UI. */
                <div className="relative" ref={checkRef}>
                  <button
                    onClick={() => setShowCheckMenu(!showCheckMenu)}
                    className={`${iconBtn} ${checkMode || showCheckMenu ? iconAccentActive : iconAccentIdle}`}
                    title={`${t("tooltipCheck")} (${formatHotkey("KeyK")})`}
                    aria-pressed={!!checkMode || showCheckMenu}
                  >
                    <Icons.Crosshair className="w-[18px] h-[18px]" />
                  </button>
                  {showCheckMenu && (
                      <div className="absolute right-0 top-full mt-1 bg-surface theme-border rounded-theme shadow-xl p-1.5 w-72 z-30 overlay-pop"
                        style={{ transformOrigin: "top right" }}
                        onClick={() => setShowCheckMenu(false)}>
                        <div className="px-2.5 pt-1.5 pb-2 text-[11px] font-bold text-text-dim uppercase tracking-wider select-none">
                          {t("checkMenuTitle")}
                        </div>
                        <div className="flex flex-col">
                          {checkMenuModes.map((mode) => {
                            const { Icon, tone, titleKey, descKey } = CHECK_MODE_UI[mode];
                            return (
                              <button key={mode} onClick={() => setCheckMode(mode)}
                                className="group w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-theme hover:bg-surface-alt transition cursor-pointer">
                                <span className={`flex items-center justify-center w-10 h-10 rounded-theme shrink-0 ${
                                  tone === "primary" ? "bg-primary/12 text-primary" : tone === "ai" ? "bg-ai/12 text-ai" : "bg-accent/12 text-accent"
                                }`}>
                                  <Icon className="w-5 h-5" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-bold text-text">{t(titleKey)}</span>
                                  {/* Some descriptions name the host (「仅{host}可见」), so every
                                      row gets the rule's title whether it uses it or not. */}
                                  <span className="block text-xs text-text-muted truncate">{t(descKey, { host: hostLabel })}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                  )}
                </div>
              ) : checkMenuModes.length === 1 ? (
                /* Single-mode rule (basic): a single direct 发起检定 button. */
                <button
                  onClick={() => setCheckMode(checkMode === "check" ? null : "check")}
                  className={`${iconBtn} ${checkMode === "check" ? iconAccentActive : iconAccentIdle}`}
                  title={`${t("tooltipCheck")} (${formatHotkey("KeyK")})`}
                  aria-pressed={checkMode === "check"}
                >
                  <Icons.Crosshair className="w-[18px] h-[18px]" />
                </button>
              ) : null /* No-check rule (triangle): hide the button entirely. */}
              <div className="relative" ref={itemMenuRef}>
                <button
                  onClick={() => { setShowItemMenu(!showItemMenu); setShowAiMenu(false); setShowSystemMenu(false); }}
                  className={`relative flex items-center justify-center gap-1 h-9 px-2 rounded-theme border transition-colors cursor-pointer ${showItemManager || showItemMenu ? iconPrimaryActive : iconPrimaryIdle}`}
                  title={t("tooltipItemEvent")}
                  aria-pressed={showItemMenu}
                >
                  <Icons.ClipboardList className="w-[18px] h-[18px]" />
                  <Icons.ChevronDown className={`w-3.5 h-3.5 transition-transform ${showItemMenu ? "rotate-180" : ""}`} />
                  {!eventBadgeSeen && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                  )}
                </button>
                {showItemMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-surface theme-border rounded-theme shadow-xl p-1.5 w-72 z-30 overlay-pop"
                    style={{ transformOrigin: "top right" }}
                    onClick={() => setShowItemMenu(false)}>
                    <button onClick={() => setShowItemManager(true)}
                      className="group w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-theme hover:bg-surface-alt transition cursor-pointer">
                      <span className="flex items-center justify-center w-10 h-10 rounded-theme shrink-0 bg-primary/12 text-primary">
                        <Icons.ClipboardList className="w-5 h-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-text">{t("menuItemManage")}</span>
                        <span className="block text-xs text-text-muted truncate">{t("menuItemManageDesc")}</span>
                      </span>
                    </button>
                    <button onClick={() => { setShowEventManage(true); markEventBadgeSeen(); }}
                      className="group w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-theme hover:bg-surface-alt transition cursor-pointer">
                      <span className="flex items-center justify-center w-10 h-10 rounded-theme shrink-0 bg-accent/12 text-accent">
                        <Icons.Flag className="w-5 h-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text">{t("menuEventManage")}</span>
                          {!eventBadgeSeen && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0">{t("menuNewBadge")}</span>
                          )}
                        </span>
                        <span className="block text-xs text-text-muted truncate">{t("menuEventManageDesc")}</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowTimeline(!showTimeline)}
                className={`${iconBtn} ${showTimeline ? iconAccentActive : iconAccentIdle}`}
                title={`${t("tooltipTimeline")} (${formatHotkey("KeyT")})`}
                aria-pressed={showTimeline}
              >
                <Icons.Sunrise className="w-[18px] h-[18px]" />
              </button>
              <div className="relative" ref={aiRef}>
                <button
                  onClick={() => { setShowAiMenu(!showAiMenu); setShowSystemMenu(false); }}
                  className={`${iconBtn} ${showAiMenu ? iconAiActive : iconAiIdle}`}
                  title={t("tooltipAiMenu")}
                  aria-pressed={showAiMenu}
                >
                  <Icons.Bot className="w-[18px] h-[18px]" />
                </button>
                {showAiMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[180px] z-30 overlay-pop"
                      style={{ transformOrigin: "top right" }}
                      onClick={() => setShowAiMenu(false)}>
                      <button onClick={() => setShowAiImport(true)}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-ai hover:bg-surface-alt transition">
                        <Icons.Download className="w-4 h-4" /> {t("btnImport")}
                      </button>
                      <button onClick={() => setShowBotManager(true)}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-ai hover:bg-surface-alt transition">
                        <Icons.Bot className="w-4 h-4" /> {t("btnBot")}
                      </button>
                    </div>
                )}
              </div>
            </>
          )}

          {/* Leave room → back to lobby */}
          <ToolDivider />
          <Link
            href="/"
            className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-theme border border-danger/30 bg-danger/5 text-danger hover:bg-danger/15 text-xs font-bold transition-colors cursor-pointer shrink-0"
            title={t("leave")}
          >
            <Icons.LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">{t("leave")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
