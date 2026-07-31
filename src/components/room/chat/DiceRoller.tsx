"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { parseLeadingDice } from "@/lib/roll-command";
import { useEscapeToClose } from "@/lib/overlay-esc";

const DICE_FACES = [2, 3, 4, 6, 8, 10, 12, 20, 100];
const MAX_COUNT = 20;

/** Fallback selection when the room's rule has no usable default expression. */
const FALLBACK_DIE = 20;
const FALLBACK_COUNT = 1;

/**
 * Resolve the panel's opening selection from the active rule's
 * `defaultRollExpression`. The parsed die must be one the panel actually
 * offers (`DICE_FACES`); anything else (or a missing expression) falls back to
 * 1d20 so the control never opens on a face it can't render.
 */
function initialSelection(defaultExpression?: string): { die: number; count: number } {
  const parsed = parseLeadingDice(defaultExpression, MAX_COUNT);
  if (parsed && DICE_FACES.includes(parsed.faces)) {
    return { die: parsed.faces, count: parsed.count };
  }
  return { die: FALLBACK_DIE, count: FALLBACK_COUNT };
}

interface DiceRollerProps {
  onRoll: (content: string, diceDetail: string) => void;
  onClose: () => void;
  /**
   * The active room rule's `capabilities.defaultRollExpression` (e.g. "1d100",
   * "1d20", "6d4"). Seeds the initial die + count so the panel opens matching
   * the ruleset. Absent ⇒ the legacy 1d20 default.
   */
  defaultExpression?: string;
}

export function DiceRoller({ onRoll, onClose, defaultExpression }: DiceRollerProps) {
  const t = useTranslations("dice");
  // Read once on mount. The panel is conditionally rendered by its parent, so
  // it remounts on each open — every open re-seeds from the current rule.
  const [initial] = useState(() => initialSelection(defaultExpression));
  const [selectedDie, setSelectedDie] = useState(initial.die);
  const [count, setCount] = useState(initial.count);
  const [isPrivate, setIsPrivate] = useState(false);

  // Escape closes the panel (topmost-only, via the shared overlay stack).
  useEscapeToClose(onClose);

  const handleRoll = () => {
    // The roll itself is performed server-side (rollDiceAction) so it is authoritative
    // and tamper-proof — we only send the dice spec. The 🔒 prefix is the data signal
    // used to detect secret rolls downstream, so keep it on the content string.
    const detail = JSON.stringify({
      dice: `d${selectedDie}`,
      count,
    });

    let content = `🎲 ${count}d${selectedDie}`;
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
    </div>
  );
}
