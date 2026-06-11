"use client";

import { useState, useEffect } from "react";
import { formatTime, formatDiceResult } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request";
  diceDetail?: string | null;
  isPrivate: boolean;
  createdAt: string;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  onCheckRequest?: (skillName: string, diceType: string) => void;
}

export function ChatMessage({
  nickname,
  content,
  type,
  diceDetail,
  isPrivate,
  createdAt,
  isOwn,
  isBot = false,
  userId,
  onCheckRequest,
}: ChatMessageProps) {
  const t = useTranslations("chat");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check request rendering
  if (type === "check_request") {
    let checkInfo: any = null;
    try { checkInfo = diceDetail ? JSON.parse(diceDetail) : null; } catch {}
    const isTarget = checkInfo?.checkRequest?.targetUserIds?.includes(userId);

    return (
      <div className="flex justify-center py-2 animate-in fade-in">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
          isTarget ? "bg-accent/10 border border-accent/30" : "bg-surface-alt"
        }`}>
          <span className="text-sm text-text">{content}</span>
          {isTarget && onCheckRequest && (
            <button
              onClick={() => onCheckRequest(checkInfo.checkRequest.skillName, checkInfo.checkRequest.diceType)}
              className="bg-accent hover:bg-accent-hover text-white w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold transition animate-bounce"
              title="点击检定"
            >
              🎲
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === "system") {
    return (
      <div className="flex justify-center py-2 animate-in fade-in">
        <span className="text-xs text-text-dim italic bg-surface-alt px-3 py-1 rounded-full">
          {content}
        </span>
      </div>
    );
  }

  const isDice = type === "dice";

  return (
    <div className={`flex gap-3 py-1.5 group animate-in fade-in slide-in-from-bottom-1 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-theme flex items-center justify-center text-xs font-bold shrink-0 transition shadow-sm ${
          isPrivate
            ? "bg-private-bg text-accent border-2 border-private-border"
            : isOwn
            ? "bg-primary/20 text-primary border border-primary/30"
            : "bg-surface-alt text-text border border-border"
        }`}
      >
        {nickname.charAt(0).toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col max-w-[80%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="text-[11px] font-medium text-text-muted">
            {nickname}
            {isBot && " 🤖"}
            {isPrivate && ` (🔒 ${t("privateRoll")})`}
          </span>
          <span className="text-[9px] text-text-dim opacity-0 group-hover:opacity-100 transition">
            {mounted ? formatTime(createdAt) : ""}
          </span>
        </div>

        <div
          className={`rounded-theme px-3 py-2 shadow-sm break-words transition-colors ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-surface border border-border text-text"
          }`}
        >
          {isDice ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">🎲</span>
                <div>
                  <span className="font-bold font-theme-mono text-sm leading-tight">
                    {formatDiceResult(diceDetail || content)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </div>
    </div>
  );
}
