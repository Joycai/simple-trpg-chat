"use client";

import { formatTime, formatDiceResult } from "@/lib/utils";

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
  if (type === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-400 italic bg-gray-100 px-3 py-1 rounded-full">
          {content}
        </span>
      </div>
    );
  }

  const isDice = type === "dice";

  return (
    <div className={`flex gap-3 py-2 group ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isPrivate
            ? "bg-purple-200 text-purple-700 border-2 border-purple-400"
            : isOwn
            ? "bg-blue-200 text-blue-700"
            : "bg-gray-200 text-gray-700"
        }`}
      >
        {nickname.charAt(0).toUpperCase()}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : ""}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-gray-500">
            {nickname}
            {isPrivate && " 🔒"}
          </span>
          <span className="text-[10px] text-gray-400">{formatTime(createdAt)}</span>
        </div>

        <div
          className={`rounded-lg px-3 py-2 break-words ${
            isDice
              ? "bg-amber-50 border border-amber-200 text-amber-900"
              : isPrivate
              ? "bg-purple-50 border border-purple-200 text-purple-900"
              : isOwn
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-900"
          }`}
        >
          {isDice ? (
            <div className="flex items-center gap-2">
              <span className="text-lg">🎲</span>
              <div>
                <span className="font-bold font-mono text-sm">
                  {formatDiceResult(diceDetail || content)}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-sm whitespace-pre-wrap">{content}</span>
          )}
        </div>
      </div>
    </div>
  );
}
