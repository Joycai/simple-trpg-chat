"use client";

import { Icons } from "@/components/shared/icons";
import type { DiceDetailJson, DiceGrade } from "./dice-types";
import { padD100, trimSingleDieNotation } from "./dice-format";
import { DiceResultGrade, StructuredRoll } from "./DiceBits";
import { PoolCard, ShBreakdownCard, CocBpCard, D20CheckCard } from "./DiceCards";

/**
 * Structured renderer for `diceDetail`. Emits DOM hooks
 * (`.dice-result-skill`, `.dice-result-grade`, `.dice-result-insanity`)
 * so themes can style the skill name / grade chip / insanity warning without
 * regex-parsing the rendered text. Non-shrine themes see the emoji + plain text
 * unchanged because the hooks have no default styling.
 */
export function DiceResultDisplay({
  diceDetail,
  preParsed,
  fallback,
  t,
}: {
  diceDetail: string | null | undefined;
  /** Pre-parsed diceDetail from the parent's single-parse memo. When absent
   *  (legacy messages whose JSON lives in `content`), this parses locally. */
  preParsed?: DiceDetailJson | null;
  fallback: string;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
}) {
  if (!diceDetail) return <span className="dice-formula">{fallback}</span>;
  let d: DiceDetailJson;
  if (preParsed) {
    d = preParsed;
  } else {
    try {
      d = JSON.parse(diceDetail);
    } catch {
      return <span className="dice-formula">{diceDetail}</span>;
    }
  }

  // .sc — sanity check renders a card layout with its own header / body /
  // attached insanity warning. Bubble outer padding is suppressed by shrine.
  if (d.sanityCheck) {
    const { oldSanity, newSanity, deductExpression, deduction, isSuccess } = d.sanityCheck;
    const grade: Exclude<DiceGrade, "none"> = isSuccess ? "success" : "failure";
    const sanityLabel = t("scSanityLabel");
    const deductLabel = t("scDeductLabel");
    const insanityLabel = t("scWarningInsanityShort");
    const insanity = deduction >= 5;
    return (
      <div className="sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[280px]">
        <div className="sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
          <span className="dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme bg-danger/10 text-danger border border-danger/30 shrink-0">
            <Icons.Droplet className="w-4 h-4" />
          </span>
          <span className="dice-skill sc-card-title flex-1 font-semibold text-sm">{sanityLabel}检定</span>
          <span className="sc-card-summary inline-flex items-baseline gap-1 font-theme-mono">
            <span className="dice-formula text-text-dim text-xs">d100 = </span>
            <span className="dice-value text-base font-semibold">{padD100(d.sum)}</span>
            <span className="dice-target text-text-dim text-xs"> / {oldSanity}</span>
          </span>
          <DiceResultGrade grade={grade} t={t} />
        </div>
        <dl className="sc-card-body grid grid-cols-[minmax(56px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{deductLabel}</dt>
            <dd className="font-theme-mono text-text m-0">{deductExpression} = {deduction} 点</dd>
          </div>
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{sanityLabel}值</dt>
            <dd className="font-theme-mono text-text m-0">{oldSanity} → {newSanity}</dd>
          </div>
        </dl>
        {insanity && (
          <div className="sc-warning flex items-center gap-2 mx-2 mb-2 px-3 py-1.5 rounded-theme bg-danger/10 border border-danger/40 text-danger text-xs" role="alert">
            <Icons.AlertTriangle className="w-4 h-4" />
            <span>一次性扣除 ≥ 5 点 · {insanityLabel}</span>
          </div>
        )}
      </div>
    );
  }

  // COC 奖励/惩罚骰 plain roll (`.rd100b2`) — card layout, no judgment.
  if (d.bpRoll) return <CocBpCard d={d} t={t} />;

  const rawNotation = d.notation || d.dice || "";
  const showResults = Array.isArray(d.results) && d.results.length > 1;
  const isD100Check = !!d.check;

  if (d.check) {
    const { skillName, target, success, grade, successLevel, rollDisplay, breakdown } = d.check;
    if (breakdown) return <ShBreakdownCard d={d} t={t} />;
    // COC 奖励/惩罚骰 check — card layout with target + grade.
    if (d.check.bp) return <CocBpCard d={d} t={t} />;
    // DnD 5e check — d20 card (die faces / modifier / total + grade badge).
    if (d.check.d20) return <D20CheckCard d={d} t={t} />;
    const finalGrade: Exclude<DiceGrade, "none"> =
      grade && grade !== "none" ? grade : success ? "success" : "failure";
    return (
      <>
        <span className="dice-skill">{skillName}</span>
        <span className="dice-formula">{rollDisplay ?? trimSingleDieNotation(rawNotation)} = </span>
        <span className="dice-value">{padD100(d.sum)}</span>
        <span className="dice-target"> / {target}</span>
        <DiceResultGrade grade={finalGrade} t={t} />
        {typeof successLevel === "number" && (
          <span className="dice-success-level text-xs text-text-muted">
            {t("checkSuccessLevel", { level: successLevel })}
          </span>
        )}
      </>
    );
  }

  // kN keep-highest rolls: annotate which dice were kept (e.g. 3d100k2).
  const keptRolls =
    Array.isArray(d.keptRolls) &&
    Array.isArray(d.results) &&
    d.keptRolls.length < d.results.length
      ? d.keptRolls
      : null;
  const keptLabel = t("keptLabel");

  // Per-die rendering with face highlighting (Triangle Agency accents every
  // 3). Only when the detail carries `highlightFace` — all other rules keep
  // the exact joined-string output below.
  const highlightFace = typeof d.highlightFace === "number" ? d.highlightFace : null;

  // Sample 2 — a pool roll counting a target face renders as a card.
  if (highlightFace !== null) return <PoolCard d={d} face={highlightFace} t={t} />;

  // Sample 1 — a structured multi-term roll highlights per-term counts and
  // picks out kept/dropped dice inline (replacing the old "(保留[…])" trailer).
  if (Array.isArray(d.terms) && d.terms.length > 0) {
    return <StructuredRoll terms={d.terms} sum={d.sum} isD100={isD100Check} />;
  }

  // Back-compat fallback for legacy messages that carry neither `terms` nor
  // `highlightFace` (pre-structured detail): joined results + optional kept trailer.
  return (
    <>
      <span className="dice-formula">
        {rawNotation}
        {showResults && ` [${d.results!.join(", ")}]`}
        {keptRolls && (
          <span className="dice-kept">({keptLabel}[{keptRolls.join(", ")}])</span>
        )}
        {" = "}
      </span>
      <span className="dice-value">{isD100Check ? padD100(d.sum) : d.sum}</span>
    </>
  );
}
