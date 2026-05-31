"use client";

import { useState, useRef, useEffect } from "react";
import { DiceRoller } from "./DiceRoller";
import { useTranslations } from "next-intl";

interface ChatInputProps {
  onSendMessage: (content: string, type: "text" | "dice", diceDetail?: string, isPrivate?: boolean) => void;
  isHost: boolean;
}

export function ChatInput({ onSendMessage, isHost }: ChatInputProps) {
  const t = useTranslations("chat");
  const [message, setMessage] = useState("");
  const [showDice, setShowDice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, "text");
    setMessage("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
