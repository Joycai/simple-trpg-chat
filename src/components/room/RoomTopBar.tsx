"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import type { Room } from "@/components/room/types";

type CheckMode = null | "check" | "psychology" | "sancheck";

// Thin vertical rule used to separate logical button groups in the top bar.
function ToolDivider() {
  return <div className="hidden sm:block w-px h-5 bg-border self-center shrink-0" aria-hidden />;
}

interface RoomTopBarProps {
  room: Room;
  isHost: boolean;
  nickname: string;
  status: "connecting" | "connected" | "error";
  roomIsCoc7th: boolean;
  playerCount: number;
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
  showSkills: boolean;
  setShowSkills: Dispatch<SetStateAction<boolean>>;
  showInventory: boolean;
  unreadItems: number;
  onToggleInventory: () => void;
  checkMode: CheckMode;
  setCheckMode: Dispatch<SetStateAction<CheckMode>>;
  showCheckMenu: boolean;
  setShowCheckMenu: Dispatch<SetStateAction<boolean>>;
  showItemManager: boolean;
  setShowItemManager: Dispatch<SetStateAction<boolean>>;
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
}

export function RoomTopBar({
  room,
  isHost,
  nickname,
  status,
  roomIsCoc7th,
  playerCount,
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
  showSkills,
  setShowSkills,
  showInventory,
  unreadItems,
  onToggleInventory,
  checkMode,
  setCheckMode,
  showCheckMenu,
  setShowCheckMenu,
  showItemManager,
  setShowItemManager,
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
}: RoomTopBarProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
  const ts = useTranslations("userSettings");

  // Uniform sizing for every top-bar control, so heights and edges line up
  // regardless of group/color. Per-button classes only add the color variant.
  const toolBtn = "flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border transition-all duration-200 cursor-pointer";

  return (
    <header className="bg-header-bg border-b border-header-border shadow-sm px-4 py-2 sm:py-3 shrink-0 z-20 relative">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-stretch md:items-center">
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Link
              href="/"
              className={`${toolBtn} bg-surface text-text-muted border-border/70 hover:text-primary hover:border-primary/40`}
              title={tn("lobby")}
            >
              <Icons.ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{tn("lobby")}</span>
            </Link>
            <button
              onClick={onToggleSidebar}
              aria-pressed={!sidebarCollapsed}
              className={`relative ${toolBtn} ${
                !sidebarCollapsed
                  ? "bg-primary/10 text-primary border-primary/40"
                  : "bg-surface text-text-muted border-border/70 hover:text-primary hover:border-primary/40"
              }`}
              title={sidebarCollapsed ? t("tooltipExpandDm") : t("tooltipCollapseSidebar")}
            >
              <Icons.MessageSquareLock className="w-4 h-4" />
              <span className="hidden sm:inline">{t("btnDm")}</span>
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </button>

            {/* Divider separating nav controls from the room identity */}
            <div className="w-px h-8 bg-border self-center shrink-0 mx-0.5 sm:mx-1" aria-hidden />

            {/* Room identity — a distinct title block, not another button */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:flex w-9 h-9 rounded-lg bg-primary/10 text-primary items-center justify-center shrink-0 shadow-sm">
                <Icons.Dices className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
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
                      className="text-base font-bold text-text leading-tight bg-input-bg border border-input-border rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-primary/50 max-w-[12rem] disabled:opacity-60"
                    />
                  ) : (
                    <div
                      className={`group flex items-center gap-1 min-w-0 ${isHost ? "cursor-pointer" : ""}`}
                      onClick={isHost ? () => { setRoomNameDraft(room.name); setEditingRoomName(true); } : undefined}
                      title={isHost ? t("editNameTooltip") : room.name}
                    >
                      <h2 className={`text-base font-bold text-text leading-tight truncate max-w-[7.5rem] sm:max-w-[14rem] ${isHost ? "group-hover:text-primary transition" : ""}`}>
                        {room.name}
                      </h2>
                      {isHost && <Icons.Pencil className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-70 transition shrink-0" />}
                    </div>
                  )}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-accent animate-pulse' : 'bg-danger'}`} title={status} />
                  {room.frozen && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-text-dim/15 text-text-dim px-1.5 py-0.5 rounded font-bold uppercase tracking-wider select-none shrink-0">
                      <Icons.Lock className="w-3 h-3" />{isHost ? t("frozenBadgeHost") : t("frozenBadge")}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-dim mt-0.5 uppercase tracking-wider font-mono">{tn("roomId", { id: room.id })}</div>
              </div>
            </div>
          </div>
          {isHost && (
            <span className="md:hidden text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider select-none self-center">
              {t("gm")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Group 1: 自身能力 (Character / You) — neutral */}
          <button
            onClick={() => setShowCharacter(!showCharacter)}
            className={`${toolBtn} ${
              showCharacter
                ? "bg-primary/10 text-primary border-primary/40"
                : "bg-surface text-text border-border/70 hover:text-primary hover:border-primary/40"
            }`}
            title={t("tooltipCharacter")}
          >
            <Icons.User className="w-4 h-4" />
            <span className="hidden sm:inline max-w-[7rem] truncate">{nickname}</span>
          </button>
          <button
            onClick={() => setShowSkills(!showSkills)}
            className={`${toolBtn} ${
              showSkills
                ? "bg-primary/10 text-primary border-primary/40"
                : "bg-surface text-text border-border/70 hover:text-primary hover:border-primary/40"
            }`}
            title={t("tooltipSkills")}
          >
            <Icons.ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">{t("btnSkills")}</span>
          </button>
          <button
            onClick={onToggleInventory}
            className={`relative ${toolBtn} ${
              showInventory
                ? "bg-primary/10 text-primary border-primary/40"
                : "bg-surface text-text border-border/70 hover:text-primary hover:border-primary/40"
            }`}
            title={t("tooltipInventory")}
          >
            <Icons.Package className="w-4 h-4" />
            <span className="hidden sm:inline">{t("btnInventory")}</span>
            {unreadItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadItems > 9 ? "9+" : unreadItems}
              </span>
              )}
            </button>

          {/* Group 2: Host 功能区 (检定 + 道具管理) — amber */}
          {isHost && (
            <>
              <ToolDivider />
              {roomIsCoc7th ? (
                /* COC 7th: a 检定 dropdown holding the three check variants */
                <div className="relative">
                  <button
                    onClick={() => setShowCheckMenu(!showCheckMenu)}
                    className={`${toolBtn} ${
                      checkMode || showCheckMenu
                        ? "bg-accent/20 text-accent border-accent/60"
                        : "bg-surface text-accent border-accent/30 hover:bg-accent/15 hover:border-accent/50"
                    }`}
                    title={t("tooltipCheck")}
                  >
                    <Icons.Crosshair className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("btnCheck")}</span>
                    <Icons.ChevronDown className="w-3 h-3" />
                  </button>
                  {showCheckMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowCheckMenu(false)} />
                      <div className="absolute left-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[160px] z-30 overlay-pop"
                        style={{ transformOrigin: "top left" }}
                        onClick={() => setShowCheckMenu(false)}>
                        <button onClick={() => setCheckMode("check")}
                          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                          <Icons.Crosshair className="w-4 h-4 text-accent" /> {t("btnCheckNormal")}
                        </button>
                        <button onClick={() => setCheckMode("psychology")}
                          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                          <Icons.EyeOff className="w-4 h-4 text-accent" /> {t("btnPsyCheck")}
                        </button>
                        <button onClick={() => setCheckMode("sancheck")}
                          className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-text hover:bg-surface-alt transition">
                          <Icons.Skull className="w-4 h-4 text-accent" /> {t("btnSanCheck")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Non-COC: a single direct 发起检定 button */
                <button
                  onClick={() => setCheckMode(checkMode === "check" ? null : "check")}
                  className={`${toolBtn} ${
                    checkMode === "check"
                      ? "bg-accent/20 text-accent border-accent/60"
                      : "bg-surface text-accent border-accent/30 hover:bg-accent/15 hover:border-accent/50"
                  }`}
                  title={t("tooltipCheck")}
                >
                  <Icons.Crosshair className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("btnCheck")}</span>
                </button>
              )}
              <button
                onClick={() => setShowItemManager(!showItemManager)}
                className={`${toolBtn} ${
                  showItemManager
                    ? "bg-accent/20 text-accent border-accent/60"
                    : "bg-surface text-accent border-accent/30 hover:bg-accent/15 hover:border-accent/50"
                }`}
                title={t("tooltipItemManage")}
              >
                <Icons.Package className="w-4 h-4" />
                <span className="hidden sm:inline">{t("btnItemManage")}</span>
              </button>
            </>
          )}

          {/* Group 3: AI 功能 (Clue Import + Bot Manager) — collapsed into a dropdown */}
          {isHost && (
            <div className="relative">
              <button
                onClick={() => { setShowAiMenu(!showAiMenu); setShowSystemMenu(false); }}
                className={`${toolBtn} ${
                  showAiMenu
                    ? "bg-ai/15 text-ai border-ai/50"
                    : "bg-surface text-ai border-ai/30 hover:bg-ai/15 hover:border-ai/50"
                }`}
                title={t("tooltipAiMenu")}
              >
                <Icons.Wand className="w-4 h-4" />
                <span className="hidden sm:inline">{t("btnAiMenu")}</span>
                <Icons.ChevronDown className="w-3 h-3" />
              </button>
              {showAiMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowAiMenu(false)} />
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
                </>
              )}
            </div>
          )}

          {/* Group 4: 系统菜单 (System Dropdown) */}
          <ToolDivider />
          <div className="relative">
            <button
              onClick={() => { setShowSystemMenu(!showSystemMenu); setShowAiMenu(false); }}
              className={`${toolBtn} ${
                showSystemMenu
                  ? "bg-primary/10 text-primary border-primary/40"
                  : "bg-surface text-text-muted border-border/70 hover:text-primary hover:border-primary/40"
              }`}
              title={t("tooltipSystem")}
            >
              <Icons.Menu className="w-4 h-4" />
              <span className="hidden sm:inline">{t("btnSystem")}</span>
              <Icons.ChevronDown className="w-3 h-3" />
            </button>
            {showSystemMenu && (
              <>
              <div className="fixed inset-0 z-20" onClick={() => setShowSystemMenu(false)} />
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
                </div>
              </div>
              </>
            )}
          </div>

          {isHost && (
            <span className="hidden md:inline text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 select-none">
              {t("gm")}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
