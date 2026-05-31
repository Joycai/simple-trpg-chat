"use client";

import { useState } from "react";
import { rollDice } from "@/lib/utils";
import { useTranslations } from "next-intl";

const DICE_TYPES = [
  { faces: 4, label: "d4", icon: "🔺" },
  { faces: 6, label: "d6", icon: "🎲" },
  { faces: 8, label: "d8", icon: "💎" },
  { faces: 10, label: "d10", icon: "🔷" },
  { faces: 12, label: "d12", icon: "⬡" },
  { faces: 20, label: "d20", icon: "⚔️" },
  { faces: 100, label: "d100", icon: "💯" },
];

interface DiceRollerProps {
  onRoll: (content: string, diceDetail: string) => void;
  isHost: boolean;
  onClose: () => void;
}

export function DiceRoller({ onRoll, isHost, onClose }: DiceRollerProps) {
  const t = useTranslations("dice");
  const [selectedDie, setSelectedDie] = useState(20);
  const [count, setCount] = useState(1);
  const [isPrivate, setIsPrivate] = useState(false);
  const [lastResult, setLastResult] = useState<{
    results: number[];
    sum: number;
    notation: string;
  } | null>(null);

  const handleRoll = () => {
    const result = rollDice(selectedDie, count);
    setLastResult(result);

    const detail = JSON.stringify({
      dice: `d${selectedDie}`,
      count,
      results: result.results,
      sum: result.sum,
      notation: result.notation,
    });

    // Content is the display text
    let content = `🎲 ${result.notation}: [${result.results.join(", ")}] = ${result.sum}`;
    if (isPrivate) {
      content = "🔒 " + content;
    }

    onRoll(content, detail);
  };

  const dieInfo = DICE_TYPES.find((d) => d.faces === selectedDie)!;

  return (
    <div className="bg-surface border border-border rounded-lg p-4 shadow-lg animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-bold text-sm flex items-center gap-2 text-text">
          <span>{dieInfo.icon}</span>
          <span>{t("title")}</span>
        </h4>
        <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none transition">
          ×
        </button>
      </div>

      {/* Dice selection */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DICE_TYPES.map((die) => (
          <button
            key={die.faces}
            onClick={() => setSelectedDie(die.faces)}
            className={`px-3 py-2 rounded-lg text-sm font-bold transition ${
              selectedDie === die.faces
                ? "bg-accent text-white shadow-md scale-105"
                : "bg-surface-alt text-text hover:bg-border"
            }`}
          >
            <span className="mr-1">{die.icon}</span>
            {die.label}
          </button>
        ))}
      </div>

      {/* Count + Roll */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCount(Math.max(1, count - 1))}
            className="w-8 h-8 rounded bg-surface-alt hover:bg-border text-text font-bold transition"
          >
            −
          </button>
          <span className="w-10 text-center font-bold font-mono text-lg text-text">{count}</span>
          <button
            onClick={() => setCount(Math.min(20, count + 1))}
            className="w-8 h-8 rounded bg-surface-alt hover:bg-border text-text font-bold transition"
          >
            +
          </button>
        </div>

        <button
          onClick={handleRoll}
          className="flex-1 bg-accent hover:bg-accent-hover text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 shadow-lg"
        >
          <span>🎲</span>
          <span>
            {count}d{selectedDie}
          </span>
        </button>
      </div>

      {/* Host-only: private roll */}
      {isHost && (
        <label className="flex items-center gap-2 text-sm text-text-muted mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>{t("private")}</span>
        </label>
      )}

      {/* Last result */}
      {lastResult && (
        <div className="bg-dice-card-bg border border-dice-card-border rounded-lg p-3">
          <div className="text-xs text-text-muted font-medium mb-1">{t("lastResult")}</div>
          <div className="font-mono font-bold text-text">
            {lastResult.notation}: [{lastResult.results.join(", ")}] ={" "}
            <span className="text-xl">{lastResult.sum}</span>
          </div>
        </div>
      )}
    </div>
  );
}
