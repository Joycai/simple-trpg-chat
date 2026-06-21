"use client";

import { useTranslations } from "next-intl";

interface DMConversation {
  userId: number;
  nickname: string;
  isBot: boolean;
  unread: number;
  lastMessage?: string;
  isBotDisabled?: boolean;
  isProviderError?: boolean;
}

interface ConversationPanelProps {
  activeTab: "public" | number; // "public" or userId
  onTabChange: (tab: "public" | number) => void;
  dmConversations: DMConversation[];
  onStartDM: () => void;
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
  width,
  collapsed,
  resizing = false,
  onToggleCollapse,
  roomName,
  roomMeta,
}: ConversationPanelProps) {
  const t = useTranslations("room");

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

      {/* Member list with avatar initials + health bar placeholder */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 3 }}>
        {dmConversations.map(conv => (
          <div
            key={conv.userId}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}
          >
            <span
              style={{
                width: 22, height: 22, borderRadius: "50%",
                background: avatarColor(conv.userId),
                color: "#fff", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {conv.nickname.charAt(0).toUpperCase()}
            </span>
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
                  <div style={{ width: "100%", height: "100%", borderRadius: 2, background: "rgb(var(--theme-success))" }} />
                </div>
              )}
            </div>
          </div>
        ))}

        {dmConversations.length === 0 && (
          <div className="py-8 text-center text-text-dim text-[10px]">
            {t("noDmMembers")}
          </div>
        )}
      </div>

      {/* New DM Button */}
      <div className="p-2 border-t border-border/50 bg-surface/30 shrink-0">
        <button
          onClick={onStartDM}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg border border-dashed border-border hover:border-primary/50 transition cursor-pointer"
          title={t("startDm")}
        >
          <span className="text-sm">＋</span>
          <span>{t("startDm")}</span>
        </button>
      </div>
    </div>
    </div>
  );
}
