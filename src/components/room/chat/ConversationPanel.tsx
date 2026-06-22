"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface DMConversation {
  userId: number;
  nickname: string;
  isBot: boolean;
  unread: number;
  lastMessage?: string;
  isBotDisabled?: boolean;
  isProviderError?: boolean;
  isOnline?: boolean;
  hp?: number;
  maxHp?: number;
}

interface ConversationPanelProps {
  activeTab: "public" | number; // "public" or userId
  onTabChange: (tab: "public" | number) => void;
  dmConversations: DMConversation[];
  onStartDM: (userId: number) => void;
  onViewCard?: (userId: number, nickname: string) => void;
  isHost: boolean;
  roomId: number;
  userId: number;
  width: number;
  collapsed: boolean;
  /** Suppresses the width/transform transition while the user drags the resize handle. */
  resizing?: boolean;
  onToggleCollapse: () => void;
  roomName: string;
  roomMeta?: string;
}

const AVATAR_COLORS = [
  "#c0392b", "#2980b9", "#27ae60", "#7c4ec8",
  "#e67e22", "#16a085", "#8e44ad", "#d35400",
];

function avatarColor(userId: number) {
  return AVATAR_COLORS[Math.abs(userId) % AVATAR_COLORS.length];
}

export function ConversationPanel({
  activeTab,
  onTabChange,
  dmConversations,
  onStartDM,
  onViewCard,
  isHost,
  width,
  userId,
  collapsed,
  resizing = false,
  onToggleCollapse,
  roomName,
  roomMeta,
}: ConversationPanelProps) {
  const t = useTranslations("room");
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);

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
    {/* Click-away overlay — closes any open member dropdown */}
    {openDropdown !== null && (
      <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
    )}

    <div className="flex flex-col bg-surface-alt border-r border-border h-full select-none conv-sidebar w-64 lg:w-[var(--sidebar-width)]">

      {/* Sidebar Header — room name + meta */}
      <div className="border-b border-border flex items-start justify-between" style={{ padding: "14px 14px 10px" }}>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[15px] text-text leading-tight truncate">{roomName}</div>
          {roomMeta && (
            <div className="text-[10px] mt-[3px] text-ai">{roomMeta}</div>
          )}
        </div>
        <button
          onClick={onToggleCollapse}
          className="ml-2 mt-0.5 p-1 rounded hover:bg-border text-text-muted hover:text-text transition cursor-pointer text-xs flex items-center justify-center w-5 h-5 shrink-0"
          title={t("collapseSidebar")}
        >
          ◀
        </button>
      </div>

      {/* Channels section */}
      <div className="flex flex-col" style={{ padding: "10px 8px", gap: 2 }}>
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
          # {t("publicChat")}
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
              <span className="shrink-0 opacity-60">🔒</span>
              <span className="truncate">DM · {conv.nickname}</span>
              {conv.isBot && conv.isBotDisabled && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 shrink-0">
                  {t("tagDisabled")}
                </span>
              )}
              {conv.isBot && !conv.isBotDisabled && conv.isProviderError && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 shrink-0 animate-pulse">
                  {t("tagProviderError")}
                </span>
              )}
            </span>
            {conv.unread > 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 animate-pulse">
                {conv.unread > 9 ? "9+" : conv.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, margin: "6px 12px", background: "rgb(var(--theme-border))" }} />

      {/* Members section label */}
      <div
        className="text-text-dim uppercase tracking-[1px]"
        style={{ padding: "4px 14px", font: "600 10px/1 var(--theme-font-mono)" }}
      >
        {t("investigators")}
      </div>

      {/* Member list — avatar + name + HP bar + action dropdown */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        {dmConversations.map(conv => {
          const hpPct = conv.hp != null && conv.maxHp
            ? Math.max(0, Math.min(100, (conv.hp / conv.maxHp) * 100))
            : 100;
          const isDropdownOpen = openDropdown === conv.userId;
          const canViewCard = isHost && !conv.isBot;
          const canDM = conv.userId !== userId;

          return (
            <div
              key={conv.userId}
              className="group relative flex items-center gap-2 rounded-md hover:bg-surface/60 transition-colors duration-100"
              style={{ padding: "5px 6px" }}
            >
              {/* Avatar with presence dot */}
              <div style={{ position: "relative", width: 24, height: 24, flexShrink: 0 }}>
                <span
                  style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: avatarColor(conv.userId),
                    color: "#fff", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {conv.nickname.charAt(0).toUpperCase()}
                </span>
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
                <div
                  className="text-text"
                  style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {conv.nickname}
                  {conv.isBot && (
                    <span className="ml-1 text-[9px] text-text-dim font-normal">GM</span>
                  )}
                </div>
                {!conv.isBot && (
                  <div style={{ height: 3, borderRadius: 2, background: "rgb(var(--theme-border))", marginTop: 3 }}>
                    <div style={{ width: `${hpPct}%`, height: "100%", borderRadius: 2, background: "rgb(var(--theme-success))", transition: "width 300ms var(--ease-emphasized)" }} />
                  </div>
                )}
              </div>

              {/* Action button + dropdown — only shown when there's at least one action */}
              {(canViewCard || canDM) && (
                <div className="relative z-50" style={{ flexShrink: 0 }}>
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
