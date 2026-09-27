"use client";

import { Icons } from "@/components/shared/icons";
import type { DiceDetailJson, DiceGrade, DiceTerm, DiceTFn } from "./dice-types";
import { padD100, trimSingleDieNotation } from "./dice-format";
import { DiceResultGrade } from "./DiceBits";

/** Sample 2 — pool roll counting a target face (Triangle Agency's 6d4 → 数「3」).
 *  Card shows dice faces, success count, chaos (non-hits), and a qualitative
 *  result. Driven by `highlightFace`, so it stays rule-agnostic. */
export function PoolCard({ d, face, t }: { d: DiceDetailJson; face: number; t: DiceTFn }) {
  const firstTerm = d.terms?.find((x): x is Extract<DiceTerm, { count: number }> => "count" in x);
  const rolls = firstTerm?.rolls ?? d.results ?? [];
  const notation = firstTerm ? `${firstTerm.count}d${firstTerm.faces}` : (d.notation ?? "");
  const successes = rolls.filter((r) => r === face).length;
  const chaos = rolls.length - successes;
  const resultText = successes === 0 ? t("taResultTrouble") : successes >= 3 ? t("taResultExceptional") : t("taResultDone");
  return (
    <div className="pool-card sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[280px]">
      <div className="pool-card-header sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
        <span className="dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme bg-primary/10 text-primary border border-primary/30 shrink-0">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 4.5L19.5 18.5L4.5 18.5Z" /></svg>
        </span>
        <span className="dice-skill sc-card-title flex-1 font-semibold text-sm">{t("taRollTitle")}</span>
        <span
          className={`pool-success-chip inline-block px-2 py-0.5 rounded text-xs font-semibold border ${
            successes === 0 ? "bg-danger/15 text-danger border-danger/30" : "bg-success/15 text-success border-success/30"
          }`}
          data-zero={successes === 0 ? "true" : undefined}
        >
          {t("taSuccessChip", { count: successes })}
        </span>
      </div>
      <dl className="pool-card-body sc-card-body grid grid-cols-[minmax(56px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
        <div className="sc-card-row contents">
          <dt className="text-text-muted">{t("taDiceRow")} {notation}</dt>
          <dd className="font-theme-mono text-text m-0">
            {"["}
            {rolls.map((r, i) => (
              <span key={i}>{i > 0 ? " " : ""}{r === face ? <span className="dice-face-hit text-success font-bold">{r}</span> : r}</span>
            ))}
            {"]"}
          </dd>
        </div>
        <div className="sc-card-row contents"><dt className="text-text-muted">{t("taSuccessRow", { face })}</dt><dd className="font-theme-mono m-0"><span className="pool-success text-success font-semibold">{successes}</span></dd></div>
        <div className="sc-card-row contents"><dt className="text-text-muted">{t("taChaosRow", { face })}</dt><dd className="font-theme-mono text-text m-0">{chaos}</dd></div>
        <div className="sc-card-row contents"><dt className="text-text-muted">{t("taResultRow")}</dt><dd className="text-text-muted m-0">{resultText}</dd></div>
      </dl>
    </div>
  );
}

/** Sample 3 — 狩魂者 d20 + 加骰(d4) + 时髦骰(d6) → breakdown card. Skill name is
 *  highlighted when set (falls back to a plain "检定"). Driven by
 *  `check.breakdown`. */
export function ShBreakdownCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
  const c = d.check!;
  const bd = c.breakdown!;
  const finalGrade: Exclude<DiceGrade, "none"> = c.grade && c.grade !== "none" ? c.grade : c.success ? "success" : "failure";
  const skill = c.skillName?.trim();
  const totalParts: string[] = [String(bd.base)];
  if (bd.bonus) totalParts.push(bd.bonus.sum >= 0 ? `+ ${bd.bonus.sum}` : `- ${-bd.bonus.sum}`);
  if (bd.style) totalParts.push(bd.style.sum >= 0 ? `+ ${bd.style.sum}` : `- ${-bd.style.sum}`);
  return (
    <div className="check-card sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[300px]">
      <div className="check-card-header sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
        <span className="dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme bg-accent/10 text-accent border border-accent/30 shrink-0">
          <Icons.Target className="w-4 h-4" />
        </span>
        <span className={`dice-skill sc-card-title flex-1 font-semibold text-sm${skill ? " check-card-skill text-accent" : ""}`}>{skill || t("shRollTitle")}</span>
        <span className="sc-card-summary inline-flex items-baseline gap-1 font-theme-mono">
          <span className="dice-value text-base font-semibold">{d.sum}</span>
          <span className="dice-target text-text-dim text-xs"> / {c.target}</span>
        </span>
        <DiceResultGrade grade={finalGrade} t={t} />
      </div>
      <dl className="check-card-body sc-card-body grid grid-cols-[minmax(64px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
        <div className="sc-card-row contents"><dt className="text-text-muted">{t("shBaseRow")} d20</dt><dd className="font-theme-mono text-text m-0">{bd.base}</dd></div>
        {bd.bonus && (
          <div className="sc-card-row contents"><dt className="text-text-muted">{t("shBonusRow")} {bd.bonus.count}d4</dt><dd className="font-theme-mono text-text m-0">[{bd.bonus.rolls.join(", ")}] <span className="text-text-muted">{t("shSumUnit", { sum: bd.bonus.sum })}</span></dd></div>
        )}
        {bd.style && (
          <div className="sc-card-row contents"><dt className="text-text-muted">{t("shStyleRow")} {bd.style.count}d6</dt><dd className="font-theme-mono text-text m-0">[{bd.style.rolls.join(", ")}] <span className="text-text-muted">{t("shSumUnit", { sum: bd.style.sum })}</span></dd></div>
        )}
        <div className="sc-card-row contents"><dt className="text-text-muted">{t("shTotalRow")}</dt><dd className="font-theme-mono text-text m-0">{totalParts.join(" ")} = {d.sum}</dd></div>
        {typeof c.successLevel === "number" && (
          <div className="sc-card-row contents"><dt className="text-text-muted">{t("shLevelRow")}</dt><dd className="font-theme-mono text-accent font-semibold m-0">{c.successLevel}</dd></div>
        )}
      </dl>
    </div>
  );
}

/** Sample 4 — COC 奖励/惩罚骰 card, for both checks (`check.bp`, with target +
 *  grade) and plain rolls (`bpRoll`, no judgment). Every number of the
 *  mechanic is spelled out: each extra die's face and the value it produces,
 *  the original d100, and the kept (lowest/highest) final result. Extra die
 *  faces render as 0..9 — the tens digit the die contributes. */
export function CocBpCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
  const bp = (d.check?.bp ?? d.bpRoll)!;
  const check = d.check?.bp ? d.check : null;
  const isBonus = bp.type === "bonus";
  const notation = `1d100${isBonus ? "b" : "p"}${bp.count}`;
  const diceLabel = isBonus ? t("bpDiceRowBonus") : t("bpDiceRowPenalty");
  const keepLabel = isBonus ? t("bpKeepLow") : t("bpKeepHigh");
  const finalGrade: Exclude<DiceGrade, "none"> | null = check
    ? check.grade && check.grade !== "none" ? check.grade : check.success ? "success" : "failure"
    : null;
  return (
    <div className="check-card sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[300px]">
      <div className="check-card-header sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
        <span className={`dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme shrink-0 ${
          check ? "bg-accent/10 text-accent border border-accent/30" : "bg-primary/10 text-primary border border-primary/30"
        }`}>
          {check ? <Icons.Target className="w-4 h-4" /> : <Icons.Dices className="w-4 h-4" />}
        </span>
        <span className={`dice-skill sc-card-title flex-1 font-semibold text-sm${check ? " check-card-skill text-accent" : ""}`}>
          {check ? check.skillName : isBonus ? t("bpTitleBonus") : t("bpTitlePenalty")}
        </span>
        <span className="sc-card-summary inline-flex items-baseline gap-1 font-theme-mono">
          <span className="dice-formula text-text-dim text-xs">{notation} = </span>
          <span className="dice-value text-base font-semibold">{padD100(bp.final)}</span>
          {check && <span className="dice-target text-text-dim text-xs"> / {check.target}</span>}
        </span>
        {finalGrade && <DiceResultGrade grade={finalGrade} t={t} />}
      </div>
      <dl className="check-card-body sc-card-body grid grid-cols-[minmax(64px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
        <div className="sc-card-row contents">
          <dt className="text-text-muted">{t("bpOriginalRow")}</dt>
          <dd className="font-theme-mono text-text m-0">{padD100(bp.original)}</dd>
        </div>
        <div className="sc-card-row contents">
          <dt className="text-text-muted">{diceLabel} ×{bp.count}</dt>
          <dd className="font-theme-mono text-text m-0">
            {bp.extra.map((e, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {"["}{e.face}{"] → "}{padD100(e.value)}
              </span>
            ))}
          </dd>
        </div>
        <div className="sc-card-row contents">
          <dt className="text-text-muted">{keepLabel}</dt>
          <dd className="font-theme-mono m-0">
            <span className="dice-value text-accent font-semibold">{padD100(bp.final)}</span>
            <span className="text-text-dim"> {t("bpFromCandidates", { list: [bp.original, ...bp.extra.map((e) => e.value)].map((v) => padD100(v)).join(", ") })}</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Sample 5 — DnD 5e d20 check card, always rendered for new dnd5e checks.
 *  Shows the die face(s) (both dice with the kept one marked for 优势/劣势),
 *  the flat modifier, and the total — with the same grade badge the COC card
 *  uses (nat 20 = 大成功, nat 1 = 大失败). Driven by `check.d20`. */
export function D20CheckCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
  const c = d.check!;
  const roll = c.d20!;
  const finalGrade: Exclude<DiceGrade, "none"> =
    c.grade && c.grade !== "none" ? c.grade : c.success ? "success" : "failure";
  const advMark =
    roll.advantage === 1 ? t("d20AdvantageMark") : roll.advantage === -1 ? t("d20DisadvantageMark") : null;
  const modStr = roll.modifier > 0 ? `+${roll.modifier}` : `${roll.modifier}`;
  return (
    <div className="check-card sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[300px]">
      <div className="check-card-header sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
        <span className="dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme bg-accent/10 text-accent border border-accent/30 shrink-0">
          <Icons.Target className="w-4 h-4" />
        </span>
        <span className={`dice-skill sc-card-title flex-1 font-semibold text-sm${c.skillName?.trim() ? " check-card-skill text-accent" : ""}`}>
          {c.skillName?.trim() || t("d20CheckTitle")}
        </span>
        <span className="sc-card-summary inline-flex items-baseline gap-1 font-theme-mono">
          <span className="dice-formula text-text-dim text-xs">{trimSingleDieNotation(d.notation)} = </span>
          <span className="dice-value text-base font-semibold">{d.sum}</span>
          <span className="dice-target text-text-dim text-xs"> / {c.target}</span>
        </span>
        <DiceResultGrade grade={finalGrade} t={t} />
      </div>
      <dl className="check-card-body sc-card-body grid grid-cols-[minmax(64px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
        <div className="sc-card-row contents">
          <dt className="text-text-muted">{t("d20RollRow")}{advMark ? ` ×${roll.rolls.length}` : ""}</dt>
          <dd className="font-theme-mono text-text m-0">
            {roll.rolls.length > 1 ? (
              <>
                {"["}
                {roll.rolls.map((r, i) => {
                  // Mark only the FIRST occurrence of the kept value so a
                  // double roll of the same face doesn't highlight both.
                  const keptIdx = roll.rolls.indexOf(roll.kept);
                  return (
                    <span key={i}>
                      {i > 0 ? ", " : ""}
                      {i === keptIdx
                        ? <span className="dice-kept-hit text-primary font-semibold underline decoration-primary/40 underline-offset-2">{r}</span>
                        : <span className="dice-drop text-text-dim opacity-70">{r}</span>}
                    </span>
                  );
                })}
                {"] → "}{roll.kept}
                {advMark && <span className="text-text-muted"> · {advMark}</span>}
              </>
            ) : (
              roll.kept
            )}
          </dd>
        </div>
        {(roll.modifier !== 0 || roll.modifierDisplay) && (
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{t("d20ModifierRow")}</dt>
            {/* The engine's display ("+1+1d6([3])=+4") only adds information
                when the formula embedded dice; a flat "+5=+5" is just noise. */}
            <dd className="font-theme-mono text-text m-0">
              {roll.modifierDisplay && /d/i.test(roll.modifierDisplay) ? roll.modifierDisplay : modStr}
            </dd>
          </div>
        )}
        {roll.modifier !== 0 && (
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{t("d20TotalRow")}</dt>
            <dd className="font-theme-mono m-0">
              {roll.kept} {roll.modifier > 0 ? `+ ${roll.modifier}` : `- ${-roll.modifier}`} = <span className="dice-value text-accent font-semibold">{d.sum}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
