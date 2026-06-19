"use client";

import { useState } from "react";
import { rollDice } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Icons } from "./icons";

const DICE_FACES = [2, 3, 4, 6, 8, 10, 12, 20, 100];

interface DiceRollerProps {
  onRoll: (content: string, diceDetail: string) => void;
  onClose: () => void;
}

export function DiceRoller({ onRoll, onClose }: DiceRollerProps) {
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

    // Content is the display text. The 🔒 prefix is the data signal used to
    // detect secret rolls downstream — keep it on the content string.
    let content = `🎲 ${result.notation}: [${result.results.join(", ")}] = ${result.sum}`;
    if (isPrivate) {
      content = "🔒 " + content;
    }

    onRoll(content, detail);
  };

  return (
    <div className="bg-surface border border-border rounded-theme p-4 shadow-lg animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-sm flex items-center gap-2 text-text">
          <Icons.Dices className="w-4 h-4 text-accent" />
          <span>{t("title")}</span>
        </h4>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text transition"
          aria-label={t("title")}
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      {/* Dice selection */}
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 mb-4">
        {DICE_FACES.map((faces) => (
          <button
            key={faces}
            onClick={() => setSelectedDie(faces)}
            className={`px-2 py-2 rounded-theme text-sm font-bold font-mono transition ${
              selectedDie === faces
                ? "bg-accent text-accent-foreground shadow-md scale-105"
                : "bg-surface-alt text-text hover:bg-border"
            }`}
          >
            d{faces}
          </button>
        ))}
      </div>

      {/* Count + Roll */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCount(Math.max(1, count - 1))}
            className="w-8 h-8 flex items-center justify-center rounded-theme bg-surface-alt hover:bg-border text-text transition"
            aria-label="-"
          >
            <Icons.Minus className="w-4 h-4" />
          </button>
          <span className="w-9 text-center font-bold font-mono text-lg text-text">{count}</span>
          <button
            onClick={() => setCount(Math.min(20, count + 1))}
            className="w-8 h-8 flex items-center justify-center rounded-theme bg-surface-alt hover:bg-border text-text transition"
            aria-label="+"
          >
            <Icons.Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleRoll}
          className="flex-1 bg-accent hover:bg-accent-hover text-accent-foreground font-bold py-2 px-4 rounded-theme transition flex items-center justify-center gap-2 shadow-lg"
        >
          <Icons.Dices className="w-4 h-4" />
          <span className="font-mono">
            {count}d{selectedDie}
          </span>
        </button>
      </div>

      {/* Secret roll — available to everyone (sender + host can see the result) */}
      <button
        onClick={() => setIsPrivate(!isPrivate)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-theme text-sm transition border mb-3 ${
          isPrivate
            ? "bg-private-bg text-accent border-private-border"
            : "bg-surface-alt text-text-muted border-transparent hover:bg-border"
        }`}
        aria-pressed={isPrivate}
      >
        <Icons.EyeOff className="w-4 h-4 shrink-0" />
        <span className="font-medium">{t("private")}</span>
        <span className="text-[11px] text-text-dim ml-auto text-right leading-tight">{t("privateHint")}</span>
      </button>

      {/* Last result */}
      {lastResult && (
        <div className="bg-dice-card-bg border border-dice-card-border rounded-theme p-3">
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
