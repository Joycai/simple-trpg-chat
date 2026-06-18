"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { DiceRoller } from "./DiceRoller";
import { useTranslations } from "next-intl";

interface MentionTarget {
  id: number;
  nickname: string;
  isBot: boolean;
  isBotDisabled?: boolean;
  isProviderError?: boolean;
}

interface ChatInputProps {
  onSendMessage: (content: string, type: "text" | "dice", diceDetail?: string, isPrivate?: boolean, targetUserId?: number) => void;
  isHost: boolean;
  mentions?: MentionTarget[];
  isPrivateLocked?: boolean;
  readOnly?: boolean;
}

export function ChatInput({ onSendMessage, isHost, mentions = [], isPrivateLocked = false, readOnly = false }: ChatInputProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const [message, setMessage] = useState("");
  const [showDice, setShowDice] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  
  // Private chat states
  const [isPrivate, setIsPrivate] = useState(isPrivateLocked);
  const [privateTargetId, setPrivateTargetId] = useState<number | null>(null);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync isPrivate with isPrivateLocked prop
  useEffect(() => {
    setIsPrivate(isPrivateLocked);
    if (isPrivateLocked) setPrivateTargetId(null); // When locked to a tab, we don't need the local target selector
  }, [isPrivateLocked]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea height based on content
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [message]);

  // Detect @mention query
  const mentionMatch = useMemo(() => {
    const idx = message.lastIndexOf("@");
    if (idx === -1) return null;
    const afterAt = message.slice(idx + 1);
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
    
    // If not locked to a specific tab, but private mode is toggled, ensure target is selected
    let finalTargetId = privateTargetId;
    if (!isPrivateLocked && isPrivate && !finalTargetId) {
       if (mentions.length > 0) finalTargetId = mentions[0].id;
    }

    onSendMessage(trimmed, "text", undefined, isPrivate, finalTargetId || undefined);
    setMessage("");
    
    // If not locked, auto-exit private mode after sending
    if (!isPrivateLocked) {
      setIsPrivate(false);
      setPrivateTargetId(null);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      handleSend();
    }
  };

  const handleDiceRoll = (content: string, diceDetail: string) => {
    const isSecret = content.includes("🔒");
    onSendMessage(content, "dice", diceDetail, isSecret);
    setShowDice(false);
    inputRef.current?.focus();
  };

  if (readOnly) {
    return (
      <div className="flex items-center justify-center gap-2 bg-input-bg border border-input-border rounded-theme p-3 text-text-muted text-sm select-none">
        <span>🔒</span>
        <span>{tRoom("frozenNotice")}</span>
      </div>
    );
  }

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
              <span>{m.isBot ? (m.isBotDisabled ? "🚫" : m.isProviderError ? "⚠️" : "🤖") : "👤"}</span>
              <span className="font-mono flex-1 text-left">@{m.nickname}</span>
              {m.isBot && m.isBotDisabled && (
                <span className="text-[9px] px-1 rounded-sm bg-red-500/10 text-red-500 border border-red-500/20 select-none scale-90 shrink-0">
                  🚫 {tRoom("tagDisabled")}
                </span>
              )}
              {m.isBot && !m.isBotDisabled && m.isProviderError && (
                <span className="text-[9px] px-1 rounded-sm bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 select-none scale-90 shrink-0 animate-pulse">
                  ⚠️ {tRoom("tagProviderError")}
                </span>
              )}
            </button>
          ))}
          <div className="text-[10px] text-text-dim px-3 pt-1 border-t border-border mt-1">
            {t("mentionTip")}
          </div>
        </div>
      )}

      {/* Private Chat Target Selector (Only show if manually toggled, not locked to tab) */}
      {!isPrivateLocked && isPrivate && (
        <div className="absolute bottom-full left-12 mb-2 z-10 animate-in slide-in-from-bottom-2 duration-200">
          <div className="bg-private-bg border border-private-border rounded-theme shadow-lg p-2 flex items-center gap-2">
            <span className="text-[10px] font-bold text-accent uppercase tracking-wider ml-1">{t("privateChatTarget")}</span>
            <select 
              value={privateTargetId || ""} 
              onChange={(e) => setPrivateTargetId(Number(e.target.value))}
              className="bg-surface border border-private-border rounded px-2 py-1 text-xs text-text outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>{t("selectMember")}</option>
              {mentions.map(m => (
                <option key={m.id} value={m.id}>
                  {m.isBot ? (m.isBotDisabled ? "🚫" : m.isProviderError ? "⚠️" : "🤖") : "👤"}{" "}
                  {m.nickname}
                  {m.isBot && m.isBotDisabled ? ` [${tRoom("tagDisabled")}]` : ""}
                  {m.isBot && !m.isBotDisabled && m.isProviderError ? ` [${tRoom("tagProviderError")}]` : ""}
                </option>
              ))}
            </select>
            <button 
              onClick={() => { setIsPrivate(false); setPrivateTargetId(null); }}
              className="text-text-muted hover:text-danger p-1 transition"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className={`flex items-end gap-2 bg-input-bg border rounded-theme p-2 shadow-sm transition-all duration-300 ${
        isPrivate ? "border-private-border ring-2 ring-private-border/20" : "border-input-border"
      }`}>
        <button
          onClick={() => setShowDice(!showDice)}
          className={`px-3 py-2 rounded-theme text-sm font-bold transition ${
            showDice ? "bg-accent text-white" : "bg-surface-alt text-text-muted hover:bg-border"
          }`}
          title={t("btnRollTooltip")}
        >
          🎲
        </button>

        {!isPrivateLocked && (
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={`px-3 py-2 rounded-theme text-sm transition ${
              isPrivate ? "bg-private-bg text-accent border border-private-border animate-pulse" : "bg-surface-alt text-text-muted hover:bg-border"
            }`}
            title={t("btnPrivateTooltip")}
          >
            🔒
          </button>
        )}

        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isPrivate ? t("whisperingPlaceholder") : t("inputPlaceholder")}
          className="flex-1 p-2 border-0 outline-none text-sm bg-transparent text-text resize-none overflow-y-auto max-h-32 min-h-[36px]"
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={!message.trim() || (!isPrivateLocked && isPrivate && !privateTargetId)}
          className={`px-4 py-2 rounded-theme text-sm font-bold transition ${
            isPrivate 
              ? "bg-accent hover:bg-accent-hover text-white" 
              : "bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white"
          }`}
        >
          {t("send")}
        </button>
      </div>
    </div>
  );
}
