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
      {/* Sidebar Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border bg-surface/50">
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">{t("channels")}</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-border text-text-muted hover:text-text transition cursor-pointer text-xs flex items-center justify-center w-5 h-5"
          title={t("collapseSidebar")}
        >
          ◀
        </button>
      </div>

      {/* Public Channel Section */}
      <div className="p-2">
        <button
          onClick={() => onTabChange("public")}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all duration-200 rounded-lg cursor-pointer conv-tab ${
            activeTab === "public"
              ? "bg-primary/10 text-primary shadow-sm active"
              : "text-text-muted hover:text-text hover:bg-surface/60"
          }`}
        >
          <span className="text-base shrink-0">🏠</span>
          <span className="truncate">{t("publicChat")}</span>
        </button>
      </div>

      <div className="border-t border-border/40 mx-2 conv-divider"></div>

      {/* DM Conversations Section */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dmConversations.map(conv => (
          <button
            key={conv.userId}
            onClick={() => onTabChange(conv.userId)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-all duration-200 rounded-lg relative cursor-pointer conv-tab ${
              activeTab === conv.userId
                ? "bg-primary/10 text-primary font-bold shadow-sm active"
                : "text-text-muted hover:text-text hover:bg-surface/60"
            }`}
          >
            <div className="relative shrink-0 flex items-center">
              <span className="text-base">{conv.isBot ? "🤖" : "👤"}</span>
              {conv.isBot && conv.isBotDisabled && (
                <div className="absolute -bottom-1 -right-1 bg-surface-alt rounded-full text-[8px] leading-none border border-border p-[1px] shadow-sm select-none animate-pulse" title={t("aiDisabled")}>🚫</div>
              )}
              {conv.isBot && !conv.isBotDisabled && conv.isProviderError && (
                <div className="absolute -bottom-1 -right-1 bg-surface-alt rounded-full text-[8px] leading-none border border-border p-[1px] shadow-sm select-none" title={t("providerError")}>⚠️</div>
              )}
            </div>
            <span className="truncate text-left flex-1 pr-4 flex items-center gap-1">
              <span className="truncate">{conv.nickname}</span>
              {conv.isBot && conv.isBotDisabled && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 select-none scale-90 origin-left shrink-0">
                  {t("tagDisabled")}
                </span>
              )}
              {conv.isBot && !conv.isBotDisabled && conv.isProviderError && (
                <span className="text-[8px] font-normal px-0.5 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 select-none scale-90 origin-left shrink-0 animate-pulse">
                  {t("tagProviderError")}
                </span>
              )}
            </span>

            {/* Unread badge */}
            {conv.unread > 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 animate-pulse">
                {conv.unread > 9 ? "9+" : conv.unread}
              </span>
            )}
          </button>
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
