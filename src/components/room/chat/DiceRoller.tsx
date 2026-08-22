"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { parseLeadingDice } from "@/lib/roll-command";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import {
  addDie, adjustTerm, removeTerm, setModifier, buildExpression, termRange, totalRange, diceCount,
  parseExpression, type DiceTerm,
} from "@/lib/dice-builder";

/** 3×3 pad, matching the design's grid. */
const DICE_FACES = [2, 3, 4, 6, 8, 10, 12, 20, 100];
const PRESETS = ["1d100", "1d20", "3d6", "1d6+1d4"];

interface DiceRollerProps {
  /** Emits the finished expression (e.g. "2d6+1d4+2"); the panel never rolls. */
  onRoll: (expression: string, hidden: boolean) => void;
  onClose: () => void;
  /**
   * The active room rule's `capabilities.defaultRollExpression` (e.g. "1d100",
   * "1d20", "6d4"). Seeds the opening tray so the panel matches the ruleset.
   */
  defaultExpression?: string;
  /** Last expression rolled from this panel, offered as a "↺ 上次" preset. */
  lastExpression?: string;
}

export function DiceRoller({ onRoll, onClose, defaultExpression, lastExpression }: DiceRollerProps) {
  const t = useTranslations("dice");

  // Seeded once: the panel is conditionally rendered, so it remounts per open.
  const [terms, setTerms] = useState<DiceTerm[]>(() => {
    const parsed = parseLeadingDice(defaultExpression, 20);
    return parsed ? [{ faces: parsed.faces, count: parsed.count }] : [{ faces: 20, count: 1 }];
  });
  const [modifier, setMod] = useState(0);
  const [hidden, setHidden] = useState(false);

  const { close, panelRef } = useOverlayTransition(onClose, "popover");

  // Long-press on a die adds five at once. The timer firing is also what marks
  // the gesture as "handled", so the click that follows the release is ignored.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  // Which face is mid-hold, so its `.dice-hold-fill` can sweep. State rather
  // than a ref: this has to drive a render. Cleared the instant the timer
  // fires, so the fill retracts as the five dice land — the completed sweep
  // and the result arrive together instead of the bar sitting full.
  const [holdingFace, setHoldingFace] = useState<number | null>(null);

  const startHold = (faces: number) => {
    heldRef.current = false;
    setHoldingFace(faces);
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setHoldingFace(null);
      setTerms((prev) => addDie(prev, faces, 5));
    }, 400);
  };
  const endHold = (faces: number) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHoldingFace(null);
    if (heldRef.current) return; // the hold already added five
    setTerms((prev) => addDie(prev, faces, 1));
  };
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setHoldingFace(null);
    heldRef.current = true; // suppress the click a drag-off would otherwise fire
  };

  const applyPreset = (expr: string) => {
    const parsed = parseExpression(expr);
    setTerms(parsed.terms);
    setMod(parsed.modifier);
  };

  const expression = buildExpression(terms, modifier);
  const total = diceCount(terms);
  const range = totalRange(terms, modifier);
  const canRoll = terms.length > 0;

  const handleRoll = () => {
    if (!canRoll) return;
    onRoll(expression, hidden);
    close();
  };

  const countOf = (faces: number) => terms.find((x) => x.faces === faces)?.count ?? 0;

  return (
    /* origin-bottom so the popover scales out of the input bar below it. */
    <div ref={panelRef} className="bg-surface border border-border rounded-theme shadow-lg origin-bottom overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Icons.Dices className="w-4 h-4 text-accent shrink-0" />
        <h4 className="font-bold text-sm text-text">{t("title")}</h4>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-text-muted">
          {t("mixedBadge")}
        </span>
        <button
          onClick={close}
          className="ml-auto text-text-muted hover:text-text transition cursor-pointer"
          aria-label={t("title")}
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row">
        {/* ---- Left: dice pad + presets ---- */}
        <div className="sm:w-[15.5rem] shrink-0 p-4 border-b sm:border-b-0 sm:border-r border-border flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold tracking-widest text-text-dim font-theme-mono">
              {t("dicePoolLabel")}
            </span>
            <span className="text-[10px] text-text-dim truncate">{t("dicePoolHint")}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DICE_FACES.map((faces) => {
              const n = countOf(faces);
              return (
                <button
                  key={faces}
                  onPointerDown={() => startHold(faces)}
                  onPointerUp={() => endHold(faces)}
                  onPointerLeave={cancelHold}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`relative py-2.5 rounded-theme border text-sm font-bold font-theme-mono transition-[color,background-color,border-color,scale] duration-150 active:scale-[0.96] cursor-pointer select-none ${
                    n > 0
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border text-text hover:bg-surface-alt"
                  }`}
                >
                  {/* Hold-to-add-five progress. No `overflow-hidden` on the
                      button — that would clip the count badge, which hangs
                      outside it — so the fill clips itself with `clip-path`
                      and inherits the themed radius. The label is wrapped in a
                      positioned span so it paints above the fill: an abspos
                      element with `z-index: auto` sits over normal-flow inline
                      content whatever the DOM order. */}
                  <span className="dice-hold-fill" aria-hidden data-holding={holdingFace === faces ? "true" : undefined} />
                  <span className="relative">d{faces}</span>
                  {/* Count badge replaces the old separate −/1/+ stepper. */}
                  {n > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border pt-3 flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-text-dim font-theme-mono">
              {t("presetsLabel")}
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1.5 rounded-theme border border-border text-xs font-theme-mono text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  {p}
                </button>
              ))}
              {lastExpression && (
                <button
                  onClick={() => applyPreset(lastExpression)}
                  title={lastExpression}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-theme border border-dashed border-border text-xs text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Icons.RotateCcw className="w-3 h-3" />
                  {t("lastUsed")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ---- Right: the combo tray ---- */}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{t("trayLabel")}</span>
            <button
              onClick={() => { setTerms([]); setMod(0); }}
              className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-danger transition cursor-pointer"
            >
              <Icons.Trash2 className="w-3.5 h-3.5" />
              {t("trayClear")}
            </button>
          </div>

          {terms.length === 0 ? (
            <p className="text-xs text-text-dim border border-dashed border-border rounded-theme py-6 text-center">
              {t("trayEmpty")}
            </p>
          ) : (
            terms.map((term) => {
              const [lo, hi] = termRange(term);
              return (
                <div
                  key={term.faces}
                  className="flex items-center gap-2 rounded-theme border border-accent/40 bg-accent/[0.07] pl-3 pr-1.5 py-1.5"
                >
                  <span className="font-bold font-theme-mono text-text">{term.count}d{term.faces}</span>
                  <span className="text-[11px] text-text-dim font-theme-mono">{lo}–{hi}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => setTerms((p) => adjustTerm(p, term.faces, -1))}
                      aria-label={t("decrease")}
                      className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
                      <Icons.Minus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setTerms((p) => adjustTerm(p, term.faces, 1))}
                      aria-label={t("increase")}
                      className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
                      <Icons.Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setTerms((p) => removeTerm(p, term.faces))}
                      aria-label={t("removeTerm")}
                      className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-danger/10 text-text-dim hover:text-danger transition cursor-pointer">
                      <Icons.X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Modifier folds into the tray instead of owning a row of its own. */}
          <div className="flex items-center gap-2 rounded-theme border border-dashed border-border px-3 py-1.5">
            <span className="text-xs text-text-muted">{t("modifier")}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setMod((m) => setModifier(m, -1))}
                aria-label={t("decrease")}
                className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
                <Icons.Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-9 text-center font-bold font-theme-mono text-sm text-text">
                {modifier > 0 ? `+${modifier}` : modifier}
              </span>
              <button onClick={() => setMod((m) => setModifier(m, 1))}
                aria-label={t("increase")}
                className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
                <Icons.Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Live expression — exactly the string handed to `.r`. */}
          <div className="flex items-baseline gap-2 rounded-theme bg-surface-alt px-3 py-2">
            <span className="font-bold font-theme-mono text-text truncate">
              {expression || "—"}
            </span>
            {canRoll && (
              <span className="ml-auto text-[11px] text-text-dim shrink-0">
                {t("range")} <span className="font-theme-mono">{range[0]}–{range[1]}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHidden((h) => !h)}
              aria-pressed={hidden}
              title={t("privateHint")}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-theme border text-xs transition cursor-pointer shrink-0 ${
                hidden
                  ? "bg-private-bg text-accent border-private-border"
                  : "bg-surface-alt text-text-muted border-transparent hover:text-text"
              }`}
            >
              <Icons.EyeOff className="w-4 h-4" />
              {t("private")}
            </button>
            <button
              onClick={handleRoll}
              disabled={!canRoll}
              className="flex-1 min-w-0 bg-accent hover:bg-accent-hover text-accent-foreground font-bold py-2.5 px-4 rounded-theme transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Icons.Dices className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("rollN", { count: total })}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
