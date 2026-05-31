"use client";

import { useState, useRef, useEffect } from "react";
import { DiceRoller } from "./DiceRoller";

interface ChatInputProps {
  onSendMessage: (content: string, type: "text" | "dice", diceDetail?: string, isPrivate?: boolean) => void;
  isHost: boolean;
}

export function ChatInput({ onSendMessage, isHost }: ChatInputProps) {
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
    // Extract isPrivate from content
    const isPrivate = content.startsWith("🔒");
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
      <div className="flex items-center gap-2 bg-white border rounded-lg p-2 shadow-sm">
        <button
          onClick={() => setShowDice(!showDice)}
          className={`px-3 py-2 rounded-lg text-sm font-bold transition ${
            showDice ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          title="骰点面板"
        >
          🎲
        </button>

        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          className="flex-1 p-2 border-0 outline-none text-sm"
        />

        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-bold transition"
        >
          发送
        </button>
      </div>
    </div>
  );
}
