"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { DiceRoller } from "./DiceRoller";
import { useTranslations } from "next-intl";

interface MentionTarget {
  id: number;
  nickname: string;
  isBot: boolean;
}

interface ChatInputProps {
  onSendMessage: (content: string, type: "text" | "dice", diceDetail?: string, isPrivate?: boolean) => void;
  isHost: boolean;
  mentions?: MentionTarget[];
}

export function ChatInput({ onSendMessage, isHost, mentions = [] }: ChatInputProps) {
  const t = useTranslations("chat");
  const [message, setMessage] = useState("");
  const [showDice, setShowDice] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Detect @mention query
  const mentionMatch = useMemo(() => {
    const idx = message.lastIndexOf("@");
    if (idx === -1) return null;
    const afterAt = message.slice(idx + 1);
    // Only trigger if @ is at end or followed by non-space chars
    if (afterAt.includes(" ")) return null;
    return { start: idx, query: afterAt.toLowerCase() };
  }, [message]);

  const filteredMentions = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionMatch.query;
    return mentions
      .filter(m => !q || m.nickname.toLowerCase().includes(q))
      .slice(0, 5);
  }, [mentionMatch, mentions]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionMatch?.query]);

  const applyMention = (nickname: string) => {
    if (!mentionMatch) return;
    setMessage(message.slice(0, mentionMatch.start) + `@${nickname} `);
    setMentionQuery("");
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, "text");
    setMessage("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @mention navigation
    if (filteredMentions.length > 0) {
      if (e.key === "Tab" || (e.key === "Enter" && filteredMentions.length > 0)) {
        e.preventDefault();
        applyMention(filteredMentions[mentionIndex].nickname);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDiceRoll = (content: string, diceDetail: string) => {
    // Extract isPrivate from content prefix
    const isPrivate = content.includes("🔒");
    onSendMessage(content, "dice", diceDetail, isPrivate);
    setShowDice(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      {/* Dice panel */}
      {showDice && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-10">
          <DiceRoller
            onRoll={handleDiceRoll}
            isHost={isHost}
            onClose={() => setShowDice(false)}
          />
        </div>
      )}

      {/* @mention autocomplete */}
      {filteredMentions.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 z-20 bg-surface border border-border rounded-theme shadow-lg py-1 min-w-[200px]">
          {filteredMentions.map((m, i) => (
            <button
              key={m.id + "-" + i}
              onClick={() => applyMention(m.nickname)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition ${
                i === mentionIndex ? "bg-primary/10 text-primary" : "text-text hover:bg-surface-alt"
              }`}
            >
              <span>{m.isBot ? "🤖" : "👤"}</span>
              <span className="font-mono">@{m.nickname}</span>
            </button>
          ))}
          <div className="text-[10px] text-text-dim px-3 pt-1 border-t border-border mt-1">
            ↑↓ 选择 · Tab/Enter 确认 · Esc 取消
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2 bg-input-bg border border-input-border rounded-theme p-2 shadow-sm">
        <button
          onClick={() => setShowDice(!showDice)}
          className={`px-3 py-2 rounded-theme text-sm font-bold transition ${
            showDice ? "bg-accent text-white" : "bg-surface-alt text-text-muted hover:bg-border"
          }`}
          title={t("send")}
        >
          🎲
        </button>

        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("inputPlaceholder")}
          className="flex-1 p-2 border-0 outline-none text-sm bg-transparent text-text"
        />

        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className="bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white px-4 py-2 rounded-theme text-sm font-bold transition"
        >
          {t("send")}
        </button>
      </div>
    </div>
  );
}
