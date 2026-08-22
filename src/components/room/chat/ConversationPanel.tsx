"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getRandomColorForUser, getContrastColor } from "@/lib/avatar-colors";
import { useClickOutside } from "@/lib/useClickOutside";
import { Icons } from "@/components/shared/icons";
import { useHostLabel } from "@/components/shared/host-label";
import { RESOURCE_ICON, DEFAULT_RESOURCE_COLOR } from "@/components/room/character/resource-visuals";
import type { StatusEntry } from "@/lib/rules";

interface DMConversation {
  userId: number;
  nickname: string;
  isBot: boolean;
  unread: number;
  lastMessage?: string;
  isBotDisabled?: boolean;
  isProviderError?: boolean;
  isOnline?: boolean;
  /** The rule's headline number for this member (null → no bar at all). */
  vital?: StatusEntry | null;
  avatar?: string | null;
  avatarColor?: string | null;
}

interface ConversationPanelProps {
  activeTab: "public" | number; // "public" or userId
  onTabChange: (tab: "public" | number) => void;
  dmConversations: DMConversation[];
  /** Live online count (non-bot members incl. self) — shared with the top bar so both "X 在线" labels match. */
  onlineCount: number;
  onStartDM: (userId: number) => void;
  onViewCard?: (userId: number, nickname: string) => void;
  isHost: boolean;
  roomId: number;
  userId: number;
  hostId: number;
  width: number;
  collapsed: boolean;
  /** Suppresses the width/transform transition while the user drags the resize handle. */
  resizing?: boolean;
}


export function ConversationPanel({
  activeTab,
  onTabChange,
  dmConversations,
  onlineCount,
  onStartDM,
  onViewCard,
  isHost,
  width,
  userId,
  hostId,
  collapsed,
  resizing = false,
}: ConversationPanelProps) {
  const t = useTranslations("room");
  const tChar = useTranslations("character");
  const hostLabel = useHostLabel();
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, () => setOpenDropdown(null), openDropdown !== null);

  return (
    // Outer animation shell — desktop collapses by animating width (chat reflows
    // smoothly); mobile is an overlay drawer that slides on translateX. The panel
    // stays mounted in both states so open/close can animate. overflow-hidden clips
    // the fixed-width inner column as the shell width shrinks to 0.
    <div
      style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      aria-hidden={collapsed}
      className={`absolute inset-y-0 left-0 lg:relative z-30 h-full shrink-0 overflow-hidden shadow-2xl lg:shadow-none ${
        resizing ? "" : "conv-sidebar-anim"
      } ${
        collapsed
          ? "w-64 lg:w-0 -translate-x-full lg:translate-x-0 pointer-events-none"
          : "w-64 lg:w-[var(--sidebar-width)] translate-x-0"
      }`}
    >
    <div className="flex flex-col bg-surface-alt room-shell-frost border-r border-border h-full select-none conv-sidebar w-64 lg:w-[var(--sidebar-width)]">

      {/* Channels section */}
      <div
        className="text-text-dim uppercase tracking-[1px]"
        style={{ padding: "10px 14px 4px", font: "600 10px/1 var(--theme-font-mono)" }}
      >
        {t("channels")}
      </div>
      <div className="flex flex-col" style={{ padding: "2px 8px 10px", gap: 2 }}>
        {/* Public channel */}
        <button
          onClick={() => onTabChange("public")}
          className={`w-full text-left transition-colors duration-150 cursor-pointer rounded-[6px] conv-tab ${
            activeTab === "public"
              ? "bg-primary/12 font-semibold text-primary"
              : "text-text-muted hover:text-text hover:bg-surface/60"
          }`}
          style={{
            padding: "7px 10px",
            fontSize: 13,
            borderLeft: activeTab === "public"
              ? "3px solid rgb(var(--theme-primary))"
              : "3px solid transparent",
          }}
        >
          <span className="flex items-center gap-2">
            <Icons.Navigation className="w-4 h-4 shrink-0" />
            {t("publicChat")}
          </span>
        </button>

        {/* DM channel tabs */}
        {dmConversations.map(conv => (
          <button
            key={conv.userId}
            onClick={() => onTabChange(conv.userId)}
            className={`w-full text-left relative transition-colors duration-150 cursor-pointer rounded-[6px] conv-tab ${
              activeTab === conv.userId
                ? "bg-primary/12 font-semibold text-primary"
                : "text-text-muted hover:text-text hover:bg-surface/60"
            }`}
            style={{
              padding: "7px 10px",
              fontSize: 13,
              borderLeft: activeTab === conv.userId
                ? "3px solid rgb(var(--theme-primary))"
                : "3px solid transparent",
            }}
          >
            <span className="flex items-center gap-1.5 pr-5 truncate">
              <Icons.Lock className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span className="truncate">{t("btnDm")} · {conv.nickname}</span>
              {conv.isBot && conv.isBotDisabled && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                  {t("tagDisabled")}
                </span>
              )}
              {conv.isBot && !conv.isBotDisabled && conv.isProviderError && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 shrink-0">
                  {t("tagProviderError")}
                </span>
              )}
            </span>
            {conv.unread > 0 && (
              <span key={conv.unread} className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 badge-in">
                {conv.unread > 9 ? "9+" : conv.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Divider — rain-droplet motif (per theme) */}
      <div className="conv-divider" />

      {/* Members section label + online count */}
      <div className="flex items-center justify-between" style={{ padding: "4px 14px" }}>
        <span className="text-text-dim uppercase tracking-[1px]" style={{ font: "600 10px/1 var(--theme-font-mono)" }}>
          {t("investigators")}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-success font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          {t("onlineCount", { count: onlineCount })}
        </span>
      </div>

      {/* Member list — avatar + name + HP bar + action dropdown */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        {dmConversations.map(conv => {
          // Bots have no sheet; everyone else shows their rule's primary vital
          // — a fill bar when it has a max, a bare count when it doesn't
          // (Triangle's 嘉奖), and nothing at all when the sheet is empty.
          const vital = conv.isBot ? null : conv.vital ?? null;
          const hasBar = vital != null && vital.max != null && vital.max > 0;
          const vitalPct = hasBar
            ? Math.max(0, Math.min(100, (vital.current / vital.max!) * 100))
            : 100;
          const visual = vital ? RESOURCE_ICON[vital.key] : undefined;
          const vitalColor = hasBar && (visual?.ratioTone ?? vital.key === "hp")
            ? (vitalPct > 60 ? "rgb(var(--theme-success))" : vitalPct > 30 ? "#f59e0b" : "rgb(var(--theme-danger))")
            : `rgb(${visual?.color ?? DEFAULT_RESOURCE_COLOR})`;
          const VitalIcon = vital && vital.key !== "hp" ? visual?.Icon : undefined;
          const isSelf = conv.userId === userId;
          const isHostMember = conv.userId === hostId;
          const isDropdownOpen = openDropdown === conv.userId;
          const canViewCard = isHost && !conv.isBot;
          const canDM = conv.userId !== userId;

          return (
            <div
              key={conv.userId}
              className={`group relative flex items-center gap-2 rounded-md border transition-colors duration-100 ${
                isSelf ? "bg-primary/10 border-primary/25" : "border-transparent hover:bg-surface/60"
              }`}
              style={{ padding: "5px 6px" }}
            >
              {/* Avatar with presence dot */}
              <div style={{ position: "relative", width: 24, height: 24, flexShrink: 0 }}>
                {conv.avatar ? (
                  // Avatar is a base64 data URL — next/image can't optimize these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={conv.avatar}
                    alt={conv.nickname}
                    style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <span
                    style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: conv.avatarColor || getRandomColorForUser(conv.userId),
                      color: getContrastColor(conv.avatarColor || getRandomColorForUser(conv.userId)),
                      fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {conv.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
                {!conv.isBot && (
                  <span
                    style={{
                      position: "absolute", bottom: -1, right: -1,
                      width: 8, height: 8, borderRadius: "50%",
                      background: conv.isOnline ? "rgb(var(--theme-success))" : "rgb(var(--theme-border))",
                      border: "1.5px solid rgb(var(--theme-surface-alt))",
                    }}
                  />
                )}
              </div>

              {/* Name + HP bar */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
                  <span className="text-text truncate">{conv.nickname}</span>
                  {isSelf && <span className="text-text-dim text-[10px] shrink-0">({t("you")})</span>}
                  {isHostMember && (
                    <span className="text-[8px] font-bold text-accent border border-accent/40 rounded px-1 leading-[1.4] shrink-0">{hostLabel}</span>
                  )}
                  {conv.isBot && (
                    <span className="text-[8px] font-bold text-ai border border-ai/40 rounded px-1 leading-[1.4] shrink-0">BOT</span>
                  )}
                  {vital && (
                    <span
                      className="ml-auto font-mono text-[10px] shrink-0 inline-flex items-center gap-0.5"
                      style={{ color: vitalColor }}
                      title={vital.labelKey ? tChar(vital.labelKey) : vital.label}
                    >
                      {VitalIcon && <VitalIcon className="w-2.5 h-2.5" />}
                      {hasBar ? `${vital.current}/${vital.max}` : vital.current}
                    </span>
                  )}
                </div>
                {hasBar && (
                  <div style={{ height: 3, borderRadius: 2, background: "rgb(var(--theme-border))", marginTop: 4 }}>
                    <div style={{ width: `${vitalPct}%`, height: "100%", borderRadius: 2, background: vitalColor, transition: "width 300ms var(--ease-emphasized)" }} />
                  </div>
                )}
              </div>

              {/* Action button + dropdown — only shown when there's at least one action */}
              {(canViewCard || canDM) && (
                <div className="relative z-50" style={{ flexShrink: 0 }} ref={isDropdownOpen ? dropdownRef : undefined}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(isDropdownOpen ? null : conv.userId); }}
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center rounded hover:bg-border text-text-muted hover:text-text transition-all cursor-pointer"
                    style={{ width: 20, height: 20, fontSize: 13, lineHeight: 1 }}
                    title={t("memberOptions")}
                  >
                    ⋯
                  </button>

                  {isDropdownOpen && (
                    <div
                      className="overlay-pop absolute right-0 top-full mt-0.5 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
                      style={{ zIndex: 50, "--overlay-pop-origin": "top right" } as React.CSSProperties}
                    >
                      {canViewCard && (
                        <button
                          onClick={() => { onViewCard?.(conv.userId, conv.nickname); setOpenDropdown(null); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-surface-alt cursor-pointer transition-colors"
                        >
                          {t("btnViewCard")}
                        </button>
                      )}
                      {canDM && (
                        <button
                          onClick={() => { onStartDM(conv.userId); setOpenDropdown(null); }}
                          className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-surface-alt cursor-pointer transition-colors"
                        >
                          {t("btnDm")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {dmConversations.length === 0 && (
          <div className="py-8 text-center text-text-dim text-[10px]">
            {t("noDmMembers")}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
