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
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationPanel({
  activeTab,
  onTabChange,
  dmConversations,
  onStartDM,
  roomId,
  userId,
  width,
  collapsed,
  onToggleCollapse,
}: ConversationPanelProps) {
  if (collapsed) return null;

  return (
    <div
      style={{ width: `${width}px` }}
      className="flex flex-col bg-surface-alt border-r border-border h-full shrink-0 select-none shadow-sm relative conv-sidebar"
    >
      {/* Sidebar Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border bg-surface/50">
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">聊天通道</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-border text-text-muted hover:text-text transition cursor-pointer text-xs flex items-center justify-center w-5 h-5"
          title="收起侧边栏"
        >
          ◀
        </button>
      </div>

      {/* Public Channel Section */}
      <div className="p-2">
        <button
          onClick={() => onTabChange("public")}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-all duration-200 rounded-lg cursor-pointer ${
            activeTab === "public"
              ? "bg-primary/10 text-primary shadow-sm"
              : "text-text-muted hover:text-text hover:bg-surface/60"
          }`}
        >
          <span className="text-base shrink-0">🏠</span>
          <span className="truncate">公频消息</span>
        </button>
      </div>

      <div className="border-t border-border/40 mx-2"></div>

      {/* DM Conversations Section */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {dmConversations.map(conv => (
          <button
            key={conv.userId}
            onClick={() => onTabChange(conv.userId)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-all duration-200 rounded-lg relative cursor-pointer ${
              activeTab === conv.userId
                ? "bg-primary/10 text-primary font-bold shadow-sm"
                : "text-text-muted hover:text-text hover:bg-surface/60"
            }`}
          >
            <span className="text-base shrink-0">{conv.isBot ? "🤖" : "👤"}</span>
            <span className="truncate text-left flex-1 pr-4">{conv.nickname}</span>

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
            暂无私聊成员
          </div>
        )}
      </div>

      {/* New DM Button */}
      <div className="p-2 border-t border-border/50 bg-surface/30 shrink-0">
        <button
          onClick={onStartDM}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg border border-dashed border-border hover:border-primary/50 transition cursor-pointer"
          title="发起私聊"
        >
          <span className="text-sm">＋</span>
          <span>发起私聊</span>
        </button>
      </div>
    </div>
  );
}
