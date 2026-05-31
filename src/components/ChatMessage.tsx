"use client";

import { formatTime, formatDiceResult } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system";
  diceDetail?: string | null;
  isPrivate: boolean;
  createdAt: string;
  isOwn: boolean;
}

export function ChatMessage({
  nickname,
  content,
  type,
  diceDetail,
  isPrivate,
  createdAt,
  isOwn,
}: ChatMessageProps) {
  const t = useTranslations("chat");
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
            {isPrivate && ` (🔒 ${t("privateRoll")})`}
          </span>
          <span className="text-[9px] text-text-dim opacity-0 group-hover:opacity-100 transition">{formatTime(createdAt)}</span>
        </div>

        <div
          className={`rounded-theme px-3 py-2 shadow-sm break-words transition-colors ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isOwn
              ? "bg-primary text-white"
              : "bg-surface border border-border text-text"
          }`}
        >
          {isDice ? (
            <div className="flex items-center gap-2">
              <span className="text-lg">🎲</span>
              <div>
                <span className="font-bold font-theme-mono text-sm leading-tight">
                  {formatDiceResult(diceDetail || content)}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-sm whitespace-pre-wrap leading-relaxed">{content}</span>
          )}
        </div>
      </div>
    </div>
  );
}
