"use client";

import { useState, useEffect } from "react";
import { getUnreadDMCountAction, markDMReadAction } from "@/app/actions/room";

interface DMConversation {
  userId: number;
  nickname: string;
  isBot: boolean;
  unread: number;
  lastMessage?: string;
}

interface ConversationPanelProps {
  activeTab: "public" | number; // "public" or userId
  onTabChange: (tab: "public" | number) => void;
  dmConversations: DMConversation[];
  onStartDM: () => void;
  roomId: number;
  userId: number;
}

export function ConversationPanel({
  activeTab,
  onTabChange,
  dmConversations,
  onStartDM,
  roomId,
  userId,
}: ConversationPanelProps) {
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

  // Load unread counts
  useEffect(() => {
    getUnreadDMCountAction(roomId).then(setUnreadCounts).catch(() => {});
  }, [roomId]);

  // Merge unread counts
  const conversations = dmConversations.map(c => ({
    ...c,
    unread: unreadCounts[c.userId] || 0,
  }));

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => (a as number) + (b as number), 0) as number;
  const hasUnreadDM = totalUnread > 0 && activeTab === "public";

  return (
    <div className="flex flex-col w-16 sm:w-48 bg-surface-alt border-r border-border h-full shrink-0">
      {/* Public tab */}
      <button
        onClick={() => onTabChange("public")}
        className={`flex items-center gap-2 px-3 py-3 text-sm font-bold transition border-b border-border ${
          activeTab === "public"
            ? "bg-primary/10 text-primary border-l-2 border-l-primary"
            : "text-text-muted hover:text-text hover:bg-surface-alt/80"
        }`}
      >
        <span className="text-lg">🏠</span>
        <span className="hidden sm:inline truncate">公频</span>
      </button>

      {/* DM conversations */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map(conv => (
          <button
            key={conv.userId}
            onClick={() => {
              onTabChange(conv.userId);
              if (conv.unread > 0) markDMReadAction(roomId, conv.userId);
            }}
            className={`w-full flex items-center gap-2 px-3 py-3 text-sm transition border-b border-border/30 relative ${
              activeTab === conv.userId
                ? "bg-primary/10 text-primary border-l-2 border-l-primary"
                : "text-text-muted hover:text-text hover:bg-surface-alt/80"
            }`}
          >
            <span className="text-lg shrink-0">{conv.isBot ? "🤖" : "👤"}</span>
            <span className="hidden sm:inline truncate text-xs">{conv.nickname}</span>

            {/* Unread badge */}
            {conv.unread > 0 && (
              <span className={`absolute top-2 right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 ${conv.unread > 0 ? "animate-pulse" : ""}`}>
                {conv.unread > 9 ? "9+" : conv.unread}
              </span>
            )}
          </button>
        ))}

        {conversations.length === 0 && (
          <div className="p-3 text-center text-text-dim text-[10px] hidden sm:block">
            暂无私聊
          </div>
        )}
      </div>

      {/* New DM button */}
      <button
        onClick={onStartDM}
        className="flex items-center justify-center gap-1 px-2 py-3 text-xs font-bold text-text-muted hover:text-primary hover:bg-surface-alt border-t border-border transition"
        title="发起私聊"
      >
        <span className="text-base">＋</span>
        <span className="hidden sm:inline">私聊</span>
      </button>

      {/* Public channel unread indicator */}
      {hasUnreadDM && (
        <div className="absolute bottom-12 left-14 sm:left-50 z-10">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-danger text-white text-[10px] font-bold animate-bounce">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        </div>
      )}
    </div>
  );
}
