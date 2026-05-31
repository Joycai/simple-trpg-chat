"use client";

import { useState } from "react";
import { rollDice } from "@/lib/utils";

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
    <div className="bg-white border rounded-lg p-4 shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-bold text-sm flex items-center gap-2">
          <span>{dieInfo.icon}</span>
          <span>骰点面板</span>
        </h4>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
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
                ? "bg-amber-500 text-white shadow-md scale-105"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
            className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 font-bold"
          >
            −
          </button>
          <span className="w-10 text-center font-bold font-mono text-lg">{count}</span>
          <button
            onClick={() => setCount(Math.min(20, count + 1))}
            className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 font-bold"
          >
            +
          </button>
        </div>

        <button
          onClick={handleRoll}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
        >
          <span>🎲</span>
          <span>
            {count}d{selectedDie}
          </span>
        </button>
      </div>

      {/* Host-only: private roll */}
      {isHost && (
        <label className="flex items-center gap-2 text-sm text-gray-600 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded"
          />
          <span>🔒 暗骰（仅主持人和自己可见）</span>
        </label>
      )}

      {/* Last result */}
      {lastResult && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="text-xs text-amber-600 font-medium mb-1">上次结果</div>
          <div className="font-mono font-bold text-amber-900">
            {lastResult.notation}: [{lastResult.results.join(", ")}] ={" "}
            <span className="text-xl">{lastResult.sum}</span>
          </div>
        </div>
      )}
    </div>
  );
}
