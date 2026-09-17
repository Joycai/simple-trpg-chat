"use client";

/**
 * Dice-message rendering for ChatMessage: the diceDetail payload shapes, the
 * theme-facing metadata (kind / grade / insanity), and the per-rule result
 * cards (plain, pool, 狩魂者 breakdown, COC bonus/penalty, d20 check).
 */

import { Icons } from "@/components/shared/icons";

/**
 * Theme-overridable dice metadata extracted from `diceDetail`.
 * Surfaces `kind` (roll/check/sanity), `grade` (success/failure/critical/fumble),
 * and an `insanity` flag onto `data-*` attributes so themes can style each
 * variant without re-parsing the JSON.
 */
type DiceKind = "roll" | "check" | "sanity";
type DiceGrade = "none" | "success" | "failure" | "critical" | "fumble";
/** Source shape parseDiceMeta reads off the (pre-parsed) diceDetail object. */
export type DiceMetaSource = {
  check?: { grade?: DiceGrade; success?: boolean };
  sanityCheck?: { deduction?: number };
  psy?: unknown;
} | null;

export function parseDiceMeta(d: DiceMetaSource): {
  kind: DiceKind;
  grade: DiceGrade;
  insanity: boolean;
  /** Psychology hidden roll marker — host's view of a `.psy` audience=self check. */
  psy: boolean;
} {
  if (!d) return { kind: "roll", grade: "none", insanity: false, psy: false };
  const psy = !!d.psy;
  if (d.sanityCheck) {
    const grade: DiceGrade =
      d.check?.grade ?? (d.check?.success ? "success" : "failure");
    return { kind: "sanity", grade, insanity: (d.sanityCheck.deduction ?? 0) >= 5, psy };
  }
  if (d.check) {
    const grade: DiceGrade =
      d.check.grade ?? (d.check.success ? "success" : "failure");
    return { kind: "check", grade, insanity: false, psy };
  }
  return { kind: "roll", grade: "none", insanity: false, psy };
}

/** One evaluated term of a dice expression, persisted so the renderer can
 *  highlight each term's dice count and (for kN rolls) the kept dice. */
type DiceTerm =
  | { sign: "+" | "-"; constant: number }
  | { sign: "+" | "-"; count: number; faces: number; keep?: number; rolls: number[]; keptRolls: number[] };

/** 狩魂者 structured breakdown for the card renderer. */
type ShBreakdown = {
  base: number;
  bonus: { count: number; rolls: number[]; sum: number } | null;
  style: { count: number; rolls: number[]; sum: number } | null;
};

/** COC 奖励/惩罚骰 structured payload (shape mirrors `CocBpRoll` in
 *  rules/coc7th) — extra tens dice replace the original d100's tens digit;
 *  bonus keeps the lowest candidate, penalty the highest. */
type CocBp = {
  type: "bonus" | "penalty";
  count: number;
  units: number;
  originalTens: number;
  original: number;
  extra: Array<{ face: number; value: number }>;
  final: number;
};

/** DnD 5e d20 check payload (shape mirrors `D20CheckRoll` in rules/dnd5e) —
 *  die faces (2 with 优势/劣势, the kept one marked), flat modifier, total. */
type D20Check = {
  rolls: number[];
  kept: number;
  advantage: number;
  modifier: number;
  modifierDisplay: string | null;
};

export type DiceDetailJson = {
  notation?: string;
  dice?: string;
  sum?: number;
  results?: number[];
  keptRolls?: number[];
  /** Structured per-term breakdown (count / faces / rolls / kept), for both
   *  single and compound expressions. Absent on messages predating this. */
  terms?: DiceTerm[];
  /** Die face to accent per-die (stamped at roll time from the rule's `highlightDieFace`). */
  highlightFace?: number;
  command?: string;
  check?: {
    skillName: string;
    target: number;
    success: boolean;
    grade?: DiceGrade;
    /** 狩魂者 success level (1+); null/absent for rules without tiered success. */
    successLevel?: number | null;
    /** Rule-authored per-die breakdown (e.g. `d20[14] + 2d4[3, 4]`); shown in place of the notation. */
    rollDisplay?: string;
    /** 狩魂者 structured breakdown → triggers the 狩魂 card layout. */
    breakdown?: ShBreakdown;
    /** COC 奖励/惩罚骰 check → triggers the 奖惩骰 card layout. */
    bp?: CocBp;
    /** DnD 5e structured d20 payload → triggers the d20 check card layout. */
    d20?: D20Check;
  };
  /** COC 奖励/惩罚骰 PLAIN roll (`.rd100b2`) → the same 奖惩骰 card, minus judgment. */
  bpRoll?: CocBp;
  sanityCheck?: {
    oldSanity: number;
    newSanity: number;
    deductExpression: string;
    deduction: number;
    isSuccess: boolean;
  };
};

/** Roll category drives which icon sits in the bubble's leading slot. */
export type RollKind = "plain" | "check" | "sanity";
export function getRollKind(d: DiceDetailJson): RollKind {
  if (d.sanityCheck) return "sanity";
  if (d.check) return "check";
  return "plain";
}

/** Which card layout (if any) this dice message renders as. Data-driven — a
 *  structured payload picks the layout, never a rule id: `sanityCheck` → COC
 *  理智卡; `check.breakdown` → 狩魂卡; `highlightFace` (a plain pool roll such
 *  as Triangle Agency's 6d4) → pool 数成功卡. */
export function diceCardType(d: DiceDetailJson): "sanity" | "breakdown" | "pool" | "bp" | "d20" | null {
  if (d.sanityCheck) return "sanity";
  if (d.check?.breakdown) return "breakdown";
  if (d.check?.bp || d.bpRoll) return "bp";
  if (d.check?.d20) return "d20";
  if (typeof d.highlightFace === "number") return "pool";
  return null;
}

/** d100 single-die check results pad to two digits per the design (`03` not `3`).
 *  Negative totals (possible with subtractive modifiers, e.g. 狩魂者's -yd6
 *  style dice or a d20 penalty) render as-is — `-4`, never `0-4`. */
function padD100(value: number | undefined): string {
  if (value == null) return "";
  return value >= 0 && value < 10 ? `0${value}` : String(value);
}

/** Strip the leading "1" off "1d100" → "d100" for visual cleanliness in checks. */
function trimSingleDieNotation(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("1d") ? raw.slice(1) : raw;
}

/** Leading icon for the dice bubble, chosen by roll kind, grade, and the psy flag. */
export function RollIcon({ kind, grade, psy }: { kind: RollKind; grade: DiceGrade; psy?: boolean }) {
  if (grade === "critical") return <Icons.Check className="w-4 h-4" />;
  if (grade === "fumble") return <Icons.X className="w-4 h-4" />;
  if (psy) return <Icons.Eye className="w-4 h-4" />;
  if (kind === "sanity") return <Icons.Droplet className="w-4 h-4" />;
  if (kind === "check") return <Icons.Target className="w-4 h-4" />;
  return <Icons.Dices className="w-4 h-4" />;
}

/**
 * Translatable success/failure/critical/fumble label rendered as
 * `<span class="dice-result-grade"><span class="dice-result-grade-icon"><Icon /> </span><span class="dice-result-grade-label">成功</span></span>`.
 * The icon span carries its trailing space, so hiding it cleanly removes the
 * gap for themes (e.g. shrine) that swap the icon for a colored chip.
 */
function DiceResultGrade({
  grade,
  t,
}: {
  grade: Exclude<DiceGrade, "none">;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
}) {
  const Icon =
    grade === "critical" ? Icons.CheckCheck
    : grade === "fumble" ? Icons.X
    : grade === "success" ? Icons.Check
    : Icons.X;
  return (
    <span className="dice-result-grade" data-grade={grade}>
      <span className="dice-result-grade-icon" aria-hidden><Icon className="w-3 h-3 inline-block" />{" "}</span>
      <span className="dice-result-grade-label">{t(grade)}</span>
    </span>
  );
}

type DiceTFn = (key: string, opts?: Record<string, string | number | Date>) => string;

/** Kept-dice positions for a kN term, matched as a multiset against `keptRolls`
 *  (so duplicate faces resolve correctly). null when it isn't a keep roll. */
function keptIndexSet(term: Extract<DiceTerm, { count: number }>): Set<number> | null {
  if (term.keep == null || !Array.isArray(term.keptRolls) || term.keptRolls.length >= term.rolls.length) {
    return null;
  }
  const pool = [...term.keptRolls];
  const set = new Set<number>();
  term.rolls.forEach((v, i) => {
    const j = pool.indexOf(v);
    if (j >= 0) { pool.splice(j, 1); set.add(i); }
  });
  return set;
}

/** Sample 1 — inline plain roll: each term's dice **count** is highlighted, and
 *  for kN rolls the **kept** dice are picked out inside the [ ] array (dropped
 *  dice dimmed). Replaces the old "(保留[…])" trailer. */
function StructuredRoll({ terms, sum, isD100 }: { terms: DiceTerm[]; sum: number | undefined; isD100: boolean }) {
  return (
    <>
      <span className="dice-formula">
        {terms.map((term, ti) => {
          const lead = ti === 0 ? (term.sign === "-" ? "-" : "") : ` ${term.sign} `;
          if ("constant" in term) return <span key={ti}>{lead}{term.constant}</span>;
          const kept = keptIndexSet(term);
          return (
            <span key={ti}>
              {lead}
              <span className="dice-count text-accent font-semibold">{term.count}</span>d{term.faces}
              {term.keep != null ? `k${term.keep}` : ""}
              {" ["}
              {term.rolls.map((r, ri) => (
                <span key={ri}>
                  {ri > 0 ? ", " : ""}
                  {kept
                    ? kept.has(ri)
                      ? <span className="dice-kept-hit text-primary font-semibold underline decoration-primary/40 underline-offset-2">{r}</span>
                      : <span className="dice-drop text-text-dim opacity-70">{r}</span>
                    : r}
                </span>
              ))}
              {"]"}
            </span>
          );
        })}
        {" = "}
      </span>
      <span className="dice-value">{isD100 ? padD100(sum) : sum}</span>
    </>
  );
}

/** Sample 2 — pool roll counting a target face (Triangle Agency's 6d4 → 数「3」).
 *  Card shows dice faces, success count, chaos (non-hits), and a qualitative
 *  result. Driven by `highlightFace`, so it stays rule-agnostic. */
function PoolCard({ d, face, t }: { d: DiceDetailJson; face: number; t: DiceTFn }) {
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
function ShBreakdownCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
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
function CocBpCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
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
function D20CheckCard({ d, t }: { d: DiceDetailJson; t: DiceTFn }) {
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
    const sanityLabel = t("scSanityLabel") || "理智";
    const deductLabel = t("scDeductLabel") || "扣除";
    const insanityLabel = t("scWarningInsanityShort") || "临时疯狂";
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
  const keptLabel = t("keptLabel") || "保留";

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
