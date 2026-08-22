"use client";

import { useState, useEffect, useMemo, useRef, useSyncExternalStore, memo, Fragment } from "react";
import { formatTime } from "@/lib/utils";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Icons } from "@/components/shared/icons";
import { ResourceStatusTooltip } from "@/components/room/chat/ResourceStatusTooltip";
import { TimelineDivider } from "@/components/room/chat/TimelineDivider";
import { getCharacterDataAction } from "@/app/actions/character";
import { type CharacterData } from "@/lib/character-types";
import { getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";
import { parseTimelinePayload } from "@/lib/messaging/timeline-payload";
import { EventCard } from "@/components/room/event/EventCard";
import { parseEventCardPayload, parseEventReceiptPayload } from "@/lib/story-events";
import type { Audience } from "@/lib/messaging/audience";
import type { PlayerEntry } from "@/components/room/types";
import { useHostLabel, useRoomRule } from "@/components/shared/host-label";

// Stable `useSyncExternalStore` callbacks. The store never changes, so subscribe
// is a no-op; the snapshot pair gives us a "true on client / false on server"
// mount flag without a `useEffect`.
const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

/**
 * Split a content string into a leading emoji (incl. optional VS16 variation
 * selector) and the rest. Used to give themes a hideable wrapper around the
 * 🎯/🩸/📋/📤/✅ glyphs that pepper system + check_request messages — shrine
 * hides them so the layout reads cleanly without UTF-8 emoji breaking the
 * mincho aesthetic.
 */
function stripLeadingEmoji(content: string): { emoji: string; rest: string } {
  const m = content.match(/^(\p{Extended_Pictographic}(?:\u{FE0F})?)\s*([\s\S]*)/u);
  if (!m) return { emoji: "", rest: content };
  return { emoji: m[1] ?? "", rest: m[2] ?? content };
}

/** Minimal inline renderer that only understands `**bold**` for system titles. */
function SystemTitleRenderer({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/**
 * System pill content. Single-line messages render inline next to the optional
 * emoji. Multi-line messages (currently only `.help`) split the first line off
 * as a title and route the remainder through MarkdownRenderer.
 */
function SystemPillContent({ content, block }: { content: string; block: boolean }) {
  const { emoji, rest } = stripLeadingEmoji(content);
  const emojiSpan = emoji ? (
    <span className="system-pill-emoji" aria-hidden>{emoji}{" "}</span>
  ) : null;

  if (!block) {
    return (
      <>
        {emojiSpan}
        <span className="system-pill-text">{rest}</span>
      </>
    );
  }

  const lines = rest.split("\n");
  const title = lines[0] ?? "";
  const bodyText = lines.slice(1).join("\n");

  return (
    <>
      <div className="system-pill-title">
        {emojiSpan}
        <SystemTitleRenderer text={title} />
      </div>
      {bodyText && (
        <div className="system-pill-body-text">
          <MarkdownRenderer content={bodyText} />
        </div>
      )}
    </>
  );
}

/**
 * Theme-overridable dice metadata extracted from `diceDetail`.
 * Surfaces `kind` (roll/check/sanity), `grade` (success/failure/critical/fumble),
 * and an `insanity` flag onto `data-*` attributes so themes can style each
 * variant without re-parsing the JSON.
 */
type DiceKind = "roll" | "check" | "sanity";
type DiceGrade = "none" | "success" | "failure" | "critical" | "fumble";
/** Source shape parseDiceMeta reads off the (pre-parsed) diceDetail object. */
type DiceMetaSource = {
  check?: { grade?: DiceGrade; success?: boolean };
  sanityCheck?: { deduction?: number };
  psy?: unknown;
} | null;

function parseDiceMeta(d: DiceMetaSource): {
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

type DiceDetailJson = {
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
type RollKind = "plain" | "check" | "sanity";
function getRollKind(d: DiceDetailJson): RollKind {
  if (d.sanityCheck) return "sanity";
  if (d.check) return "check";
  return "plain";
}

/** Which card layout (if any) this dice message renders as. Data-driven — a
 *  structured payload picks the layout, never a rule id: `sanityCheck` → COC
 *  理智卡; `check.breakdown` → 狩魂卡; `highlightFace` (a plain pool roll such
 *  as Triangle Agency's 6d4) → pool 数成功卡. */
function diceCardType(d: DiceDetailJson): "sanity" | "breakdown" | "pool" | "bp" | "d20" | null {
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
function RollIcon({ kind, grade, psy }: { kind: RollKind; grade: DiceGrade; psy?: boolean }) {
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
 * Structured renderer for `diceDetail`. Parallels `formatDiceResult` but emits
 * DOM hooks (`.dice-result-skill`, `.dice-result-grade`, `.dice-result-insanity`)
 * so themes can style the skill name / grade chip / insanity warning without
 * regex-parsing the rendered text. Non-shrine themes see the emoji + plain text
 * unchanged because the hooks have no default styling.
 */
function DiceResultDisplay({
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

/**
 * Wrap each `【skill】` substring in a `<span class="check-request-skill">`
 * so themes can give the skill name its own accent (e.g. shrine paints it gold)
 * without altering the surrounding sentence.
 */
function renderCheckRequestContent(content: string, highlight?: string | null): React.ReactNode {
  const { emoji, rest } = stripLeadingEmoji(content);
  // Legacy 【…】 wrap (kept for messages predating the bracket-free i18n).
  const bracketRe = /【([^】]+)】/g;
  if (bracketRe.test(rest)) {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    bracketRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(rest)) !== null) {
      if (m.index > lastIdx) parts.push(rest.slice(lastIdx, m.index));
      parts.push("【");
      parts.push(<span key={m.index} className="check-request-skill">{m[1]}</span>);
      parts.push("】");
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < rest.length) parts.push(rest.slice(lastIdx));
    return (
      <>
        {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
        {parts}
      </>
    );
  }
  // Modern path — wrap the supplied `highlight` substring (skillName / sanity label).
  if (highlight) {
    const idx = rest.indexOf(highlight);
    if (idx !== -1) {
      return (
        <>
          {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
          {rest.slice(0, idx)}
          <span className="check-request-skill">{highlight}</span>
          {rest.slice(idx + highlight.length)}
        </>
      );
    }
  }
  return (
    <>
      {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
      {rest}
    </>
  );
}

/** Wrap the leading ✅ of the check-progress label so themes can hide it. */
function renderCheckProgress(text: string): React.ReactNode {
  const { emoji, rest } = stripLeadingEmoji(text);
  return (
    <>
      {emoji && <span className="check-request-progress-emoji" aria-hidden>{emoji}{" "}</span>}
      {rest}
    </>
  );
}

/** Three-row metadata for system pills, keyed by `systemKind`. */
const SYSTEM_PILL_META: Record<"st" | "error" | "room-event" | "scene-marker", {
  icon: typeof Icons.CheckSquare;
  className: string;
}> = {
  "st":            { icon: Icons.CheckSquare,    className: "system-pill-body--ok" },
  "error":         { icon: Icons.AlertTriangle,  className: "system-pill-body--err" },
  "room-event":    { icon: Icons.UserPlus,       className: "system-pill-body--info" },
  "scene-marker":  { icon: Icons.Clock,          className: "system-pill-body--info" },
};

/**
 * Structured host-log pill for `systemKind === 'inventory-dispatch'`. Reads the
 * `diceDetail` JSON payload (action + item + recipient + count) and renders an
 * action-colored icon next to a sentence whose item name is wrapped in a
 * type-colored chip (item / clue / info / character). Falls back to the plain
 * `content` text if the payload is missing or malformed.
 */
type DispatchAction = "distribute" | "push" | "share" | "update" | "duplicate";
type DispatchItemType = "clue" | "info" | "character" | "item";
type DispatchPayload = {
  inventoryDispatch?: {
    action?: DispatchAction;
    item?: { type?: DispatchItemType; title?: string };
    recipient?: { kind?: "all" | "user"; name?: string } | null;
    count?: number | null;
  };
};

/** Action → leading-icon component. Color tokens are static classes below. */
const DISPATCH_ACTION_ICON: Record<DispatchAction, typeof Icons.Send> = {
  distribute: Icons.Send,
  push: Icons.Navigation,
  share: Icons.Share2,
  update: Icons.RefreshCw,
  duplicate: Icons.AlertTriangle,
};

/** Item type → chip icon (mirrors src/components/room/inventory/inventory-helpers.ts). */
const DISPATCH_ITEM_ICON: Record<DispatchItemType, typeof Icons.Box> = {
  item: Icons.Box,
  clue: Icons.Search,
  info: Icons.File,
  character: Icons.User,
};

/**
 * Per-action icon bubble classes — static so Tailwind's JIT can discover them.
 * Distribute/push share the ai (sending) accent; share goes green; update is a
 * neutral grey; duplicate uses danger to read as a warning.
 */
const DISPATCH_ACTION_ICON_CLASS: Record<DispatchAction, string> = {
  distribute: "bg-ai/15 text-ai border-ai/30",
  push: "bg-primary/15 text-primary border-primary/30",
  share: "bg-success/15 text-success border-success/30",
  update: "bg-text-muted/15 text-text-muted border-border",
  duplicate: "bg-danger/15 text-danger border-danger/30",
};

/** Outer pill background — duplicate gets a soft danger wash so the warning reads at a glance. */
const DISPATCH_PILL_CLASS: Record<DispatchAction, string> = {
  distribute: "bg-surface-alt border-border",
  push: "bg-surface-alt border-border",
  share: "bg-surface-alt border-border",
  update: "bg-surface-alt border-border",
  duplicate: "bg-danger/10 border-danger/40",
};

/** Per-item-type chip classes — semantic tokens so all themes pick up their own palette. */
const DISPATCH_CHIP_CLASS: Record<DispatchItemType, string> = {
  item: "border-success/45 bg-success/10 text-success",
  clue: "border-primary/45 bg-primary/10 text-primary",
  info: "border-ai/45 bg-ai/10 text-ai",
  character: "border-accent/45 bg-accent/10 text-accent",
};

function DispatchChip({ type, title }: { type: DispatchItemType; title: string }) {
  const ChipIcon = DISPATCH_ITEM_ICON[type];
  return (
    <span
      className={`dispatch-chip inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${DISPATCH_CHIP_CLASS[type]}`}
      data-item-type={type}
    >
      <ChipIcon className="dispatch-chip-icon w-3 h-3" />
      <span className="dispatch-chip-title font-medium">{title}</span>
    </span>
  );
}

function DispatchPill({
  content,
  diceDetail,
  enter = false,
}: {
  content: string;
  diceDetail: string | null | undefined;
  /** Entrance-animation gate, forwarded from the owning ChatMessage. */
  enter?: boolean;
}) {
  const t = useTranslations("inventoryDispatch");
  // Captured once on mount — same pattern as ChatMessage's `entered`.
  const [entered] = useState(enter);
  const pillEnterClass = entered ? "animate-in fade-in" : "";

  let payload: DispatchPayload["inventoryDispatch"] | null = null;
  if (diceDetail) {
    try {
      const parsed = JSON.parse(diceDetail) as DispatchPayload;
      payload = parsed.inventoryDispatch ?? null;
    } catch {
      payload = null;
    }
  }

  // Fallback: no payload → render the plain content as a neutral pill so older
  // messages (or any malformed payload) still display sensibly.
  if (!payload?.action || !payload.item?.type || !payload.item.title) {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`}>
        <span className="system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full bg-surface-alt text-text-dim">
          <span className="system-pill-text">{content}</span>
        </span>
      </div>
    );
  }

  const action = payload.action;
  const itemType = payload.item.type;
  const itemTitle = payload.item.title;
  const recipient = payload.recipient ?? null;
  const count = payload.count ?? null;
  const ActionIcon = DISPATCH_ACTION_ICON[action];

  // Pick the message template based on action + recipient shape.
  const messageKey: string =
    action === "distribute" ? (recipient?.kind === "all" ? "distributedAll" : "distributedOne")
    : action === "push" ? (recipient?.kind === "all" ? "cluePushAll" : "cluePushTargeted")
    : action === "share" ? "shared"
    : action === "update" ? "updated"
    : recipient?.kind === "all" ? "alreadyHadAll" : "alreadyHadOne";

  return (
    <div
      className={`dispatch-pill-wrap flex justify-center py-2 ${pillEnterClass}`}
      data-action={action}
    >
      <div
        className={`dispatch-pill inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1 rounded-full border text-xs ${DISPATCH_PILL_CLASS[action]} text-text`}
        data-action={action}
        data-item-type={itemType}
      >
        <span
          className={`dispatch-pill-icon inline-flex items-center justify-center w-6 h-6 rounded-full border shrink-0 ${DISPATCH_ACTION_ICON_CLASS[action]}`}
          aria-hidden
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </span>
        <span className="dispatch-pill-text inline-flex items-center gap-1.5 flex-wrap">
          {t.rich(messageKey, {
            strong: (chunks) => <strong className="dispatch-pill-recipient font-semibold text-text">{chunks}</strong>,
            num: (chunks) => <span className="dispatch-pill-count font-theme-mono font-semibold text-text">{chunks}</span>,
            chip: () => <DispatchChip type={itemType} title={itemTitle} />,
            recipient: recipient?.name ?? "",
            recipients: recipient?.name ?? "",
            count: count ?? 0,
          })}
          {action === "duplicate" && (
            <span className="dispatch-pill-note text-text-dim"> · {t("notRedistributed")}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Structured recipient-side pill for `systemKind === 'inventory-receipt'`. Reads
 * the `diceDetail` JSON (action + item + optional sender) and renders an
 * action-colored icon · sentence with a type-colored chip · NEW/更新 badge ·
 * "查看背包" CTA wired to `onOpenInventory`. Falls back to a neutral pill
 * when the payload is missing or malformed.
 */
type ReceiptAction = "received" | "updated" | "shared-received";

type ReceiptPayloadShape = {
  inventoryReceipt?: {
    action?: ReceiptAction;
    item?: { type?: DispatchItemType; title?: string };
    sender?: string | null;
  };
};

/** Receipt action → leading-icon component. */
const RECEIPT_ACTION_ICON: Record<ReceiptAction, typeof Icons.Send> = {
  received: Icons.Send,
  updated: Icons.RefreshCw,
  "shared-received": Icons.Share2,
};

/**
 * Per-action icon bubble color tokens — `received` uses the chip's item-type
 * accent (cyan box / red diamond etc.), `updated` is neutral grey, and
 * `shared-received` borrows the success (moss-green) palette to match the
 * player-to-player exchange feel.
 */
const RECEIPT_ACTION_ICON_CLASS: Record<ReceiptAction, string> = {
  received: "bg-ai/15 text-ai border-ai/30",
  updated: "bg-text-muted/15 text-text-muted border-border",
  "shared-received": "bg-success/15 text-success border-success/30",
};

/** Badge palette — NEW reads as fresh (primary), 更新 as a softer reminder (accent). */
const RECEIPT_BADGE_CLASS: Record<"new" | "updated", string> = {
  new: "bg-primary/15 text-primary border-primary/40",
  updated: "bg-accent/15 text-accent border-accent/40",
};

function ReceiptPill({
  content,
  diceDetail,
  onOpenInventory,
  enter = false,
}: {
  content: string;
  diceDetail: string | null | undefined;
  onOpenInventory?: () => void;
  /** Entrance-animation gate, forwarded from the owning ChatMessage. */
  enter?: boolean;
}) {
  const t = useTranslations("inventoryReceipt");
  // Captured once on mount — same pattern as ChatMessage's `entered`.
  const [entered] = useState(enter);
  const pillEnterClass = entered ? "animate-in fade-in" : "";

  let payload: ReceiptPayloadShape["inventoryReceipt"] | null = null;
  if (diceDetail) {
    try {
      const parsed = JSON.parse(diceDetail) as ReceiptPayloadShape;
      payload = parsed.inventoryReceipt ?? null;
    } catch {
      payload = null;
    }
  }

  // Fallback to a neutral pill when the payload is missing — keeps older
  // recipient messages (or any malformed payload) sensible.
  if (!payload?.action || !payload.item?.type || !payload.item.title) {
    return (
      <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`}>
        <span className="system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full bg-surface-alt text-text-dim">
          <span className="system-pill-text">{content}</span>
        </span>
      </div>
    );
  }

  const action = payload.action;
  const itemType = payload.item.type;
  const itemTitle = payload.item.title;
  const sender = payload.sender ?? null;
  const ActionIcon = RECEIPT_ACTION_ICON[action];

  // Sentence template: clue gets a dedicated "received new clue" phrasing;
  // every other type uses the generic "you received <chip>".
  const messageKey: string =
    action === "shared-received" ? "shared"
    : action === "updated" ? "updated"
    : itemType === "clue" ? "receivedClue"
    : "received";

  // Badge: `received` first-time → NEW; `updated` → 更新; player-to-player share
  // already conveys novelty via the sender name, so we drop the badge there.
  const badge: "new" | "updated" | null =
    action === "updated" ? "updated"
    : action === "received" ? "new"
    : null;

  return (
    <div
      className={`receipt-pill-wrap flex justify-center py-2 ${pillEnterClass}`}
      data-action={action}
    >
      <div
        className="receipt-pill inline-flex items-center gap-2 pl-1.5 pr-1.5 py-1 rounded-full border bg-surface-alt border-border text-xs text-text"
        data-action={action}
        data-item-type={itemType}
      >
        <span
          className={`receipt-pill-icon inline-flex items-center justify-center w-6 h-6 rounded-full border shrink-0 ${RECEIPT_ACTION_ICON_CLASS[action]}`}
          aria-hidden
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </span>
        <span className="receipt-pill-text inline-flex items-center gap-1.5 flex-wrap pl-1">
          {t.rich(messageKey, {
            strong: (chunks) => <strong className="receipt-pill-sender font-semibold text-text">{chunks}</strong>,
            chip: () => <DispatchChip type={itemType} title={itemTitle} />,
            sender: sender ?? "",
          })}
        </span>
        {badge && (
          <span
            className={`receipt-pill-badge inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${RECEIPT_BADGE_CLASS[badge]}`}
            data-badge={badge}
          >
            {badge === "new" ? t("badgeNew") : t("badgeUpdated")}
          </span>
        )}
        {onOpenInventory && (
          <button
            type="button"
            onClick={onOpenInventory}
            className="receipt-pill-cta inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:text-primary-hover transition pl-2 pr-2 py-0.5 rounded-full border border-transparent hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
          >
            {t("viewBackpack")}
            <Icons.ChevronDown className="w-3 h-3 -rotate-90" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Help card: structured 2-column command reference. The room's rule picks its
 * rows via `capabilities.helpEntryIds`, each id keying into the
 * `commands.helpEntries` i18n map — so every room documents exactly the
 * commands (and syntax) its rule honors.
 */
function HelpCard({ visSelfLabel }: { visSelfLabel: string }) {
  const t = useTranslations("commands");
  const rule = useRoomRule();
  let title = "Command Help";
  try { title = t("helpTitle"); } catch { /* fallback */ }
  let entries: Array<{ id: string; cmd: string; desc: string }> = [];
  try {
    const raw = (t as unknown as { raw: (k: string) => unknown }).raw("helpEntries");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const map = raw as Record<string, { cmd?: unknown; desc?: unknown } | undefined>;
      entries = rule.capabilities.helpEntryIds.flatMap((id) => {
        const e = map[id];
        return e && typeof e.cmd === "string" && typeof e.desc === "string"
          ? [{ id, cmd: e.cmd, desc: e.desc }]
          : [];
      });
    }
  } catch { /* missing — leave entries empty */ }

  return (
    <div className="help-card bg-surface-alt border border-border rounded-theme px-4 py-3 max-w-2xl text-left">
      <div className="help-card-header flex items-center gap-2 pb-1.5 mb-2 border-b border-border">
        <Icons.HelpCircle className="w-4 h-4 help-card-icon text-primary" />
        <span className="help-card-title flex-1 text-sm font-semibold">{title}</span>
        <span className="help-card-self inline-flex items-center gap-1 text-[11px] text-text-dim">
          <Icons.Lock className="w-3 h-3" /> {visSelfLabel}
        </span>
      </div>
      {entries.length > 0 && (
        <dl className="help-card-list grid grid-cols-[minmax(140px,max-content)_1fr] gap-x-4 gap-y-1 text-xs m-0">
          {entries.map((e) => (
            <div key={e.id} className="help-card-row contents">
              <dt className="font-theme-mono text-text">{e.cmd}</dt>
              <dd className="text-text-muted m-0">{e.desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// LRU-capped cache (max 200 entries) for character resource data, keyed by `${roomId}-${senderId}`
const CHAR_CACHE_MAX = 200;
const characterCache = new Map<
  string,
  {
    data: CharacterData | null;
    promise?: Promise<CharacterData | null>;
  }
>();

function setCacheEntry(key: string, value: { data: CharacterData | null; promise?: Promise<CharacterData | null> }) {
  if (!characterCache.has(key) && characterCache.size >= CHAR_CACHE_MAX) {
    // Evict oldest entry
    const oldest = characterCache.keys().next().value;
    if (oldest !== undefined) characterCache.delete(oldest);
  }
  characterCache.set(key, value);
}

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request" | "image" | "sticker" | "clue";
  /** Subtype for type='system' messages. Drives the kind-specific pill / help card render. */
  systemKind?: "st" | "error" | "room-event" | "scene-marker" | "help" | "inventory-dispatch" | "inventory-receipt" | "timeline-divider" | "event-card" | "event-receipt" | null;
  diceDetail?: string | null;
  isPrivate: boolean;
  audience?: Audience;
  createdAt: string;
  /** True when this message arrived live moments ago — plays the entrance
   *  animation. Captured once on mount, so later re-renders can't replay it. */
  enter?: boolean;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  senderId?: number;
  isHost?: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
  onCheckRequest?: (messageId: number, skillName: string, opts?: { bonusDicePrompt?: boolean }) => void;
  /** Host proxy roll. Present only for the host; when set, the check pill shows the
   *  seal button alongside the regular viewer icon. */
  onProxyCheckRequest?: (messageId: number, onBehalfOfUserId: number) => void;
  /** Loads pending targets + each player's resolved skill value for the popover preview. */
  onLoadProxyTargets?: (messageId: number) => Promise<{
    success: boolean; error?: string; skillName?: string; isSanityCheck?: boolean;
    targets?: Array<{ userId: number; nickname: string; value: number | null }>;
  }>;
  /** Called when the receipt-pill CTA (`查看背包`) is clicked — opens the inventory drawer. */
  onOpenInventory?: () => void;
  /** Set of event ids the viewer may read — decides an event card's locked/unlocked face. */
  visibleEventIds?: Set<number>;
  /** Opens an event's detail modal (from an event card / receipt). */
  onOpenEvent?: (eventId: number) => void;
  /** Host-only: withdraw (delete) a timeline-divider message by id. */
  onWithdrawTimeline?: (messageId: number) => void | Promise<void>;
  messageId?: number;
  roomId?: number;
  hostId?: number;
  avatarColor?: string | null;
  avatar?: string | null;
  /** Full member roster — used to resolve the 投娘 (dice announcer) bot's own
   *  avatar/color when a dice card is re-skinned under its identity. */
  players?: PlayerEntry[];
}

export const ChatMessage = memo(function ChatMessage({
  nickname,
  content,
  type,
  systemKind,
  diceDetail,
  isPrivate,
  audience,
  createdAt,
  enter = false,
  isOwn,
  isBot = false,
  userId,
  senderId,
  isHost = false,
  onViewCharacter,
  onStartDM,
  onCheckRequest,
  onProxyCheckRequest,
  onLoadProxyTargets,
  onOpenInventory,
  visibleEventIds,
  onOpenEvent,
  onWithdrawTimeline,
  messageId,
  roomId,
  hostId,
  avatarColor,
  avatar,
  players,
}: ChatMessageProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  const hostLabel = useHostLabel();
  // `formatTime` reads `new Date()` and diverges between SSR and client.
  // useSyncExternalStore returns the server snapshot (false) during SSR and the
  // client snapshot (true) thereafter, avoiding the setState-in-effect pattern.
  const mounted = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  // Capture the entrance flag once — the row is keyed by message id, so this
  // stays true for the animation's lifetime and never re-arms on re-render.
  const [entered] = useState(enter);
  const rowEnterClass = entered ? "animate-in fade-in slide-in-from-bottom-1" : "";
  const pillEnterClass = entered ? "animate-in fade-in" : "";
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyTargets, setProxyTargets] = useState<Array<{ userId: number; nickname: string; value: number | null }> | null>(null);
  // 投娘 quip placeholder: shown while quipPending, auto-hidden after 8s so a
  // missed SSE patch doesn't breathe forever (re-appears if the quip patches
  // in later, or on next full reload once it's landed in diceDetail).
  const [showQuipPlaceholder, setShowQuipPlaceholder] = useState(true);
  // diceDetail parsed exactly once per unique payload — every consumer below
  // (dice meta, dice card fields, check_request pill, quip placeholder,
  // DiceResultDisplay) previously re-ran JSON.parse on the same string.
  // null covers both "no detail" and "malformed detail".
  const parsedDetail = useMemo<Record<string, unknown> | null>(() => {
    if (!diceDetail) return null;
    try { return JSON.parse(diceDetail); } catch { return null; }
  }, [diceDetail]);
  useEffect(() => {
    if (type !== "dice") return;
    const pending = !!(parsedDetail as { announcer?: { quipPending?: boolean } } | null)?.announcer?.quipPending;
    if (!pending) return;
    const timer = setTimeout(() => setShowQuipPlaceholder(false), 8000);
    return () => clearTimeout(timer);
    // Mount-once: each ChatMessage instance is keyed by message id in ChatArea,
    // so it never needs to re-arm for the same card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [proxyLoading, setProxyLoading] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const proxyAnchorRef = useRef<HTMLDivElement>(null);
  // Hover-intent timer: the tooltip only mounts if the cursor rests on the
  // avatar for 120ms, so sweeping the cursor down the avatar column doesn't
  // replay the enter animation on every message.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setShowMenu(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showMenu]);

  useEffect(() => {
    if (!proxyOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (proxyAnchorRef.current && !proxyAnchorRef.current.contains(e.target as Node)) {
        setProxyOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [proxyOpen]);

  const canView = !!(roomId && hostId && senderId && !isOwn && (
    senderId !== hostId && (isHost ? true : !isBot)
  ));

  useEffect(() => {
    if (!isHovered || !canView) return;

    const updatePosition = () => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.right + 8,
        });
      }
    };

    updatePosition();

    // rAF-throttled like the main chat scroll handler: the raw scroll event
    // fires several times per frame, and each updatePosition is a forced
    // layout (getBoundingClientRect) plus a React commit on this message.
    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    // Find nearest scrollable container
    const scrollParent = avatarRef.current?.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", scheduleUpdate);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", scheduleUpdate);
      }
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [isHovered, canView]);

  const handleMouseEnter = () => {
    // Hover intent: delay the tooltip mount; the data prefetch below stays
    // immediate (fetching early is harmless).
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
    if (!canView || !roomId || !senderId) return;

    const cacheKey = `${roomId}-${senderId}`;
    const cached = characterCache.get(cacheKey);

    if (cached) {
      if (cached.promise) {
        setLoading(true);
        cached.promise.then((data) => {
          setCharData(data);
          setLoading(false);
        });
      } else {
        setCharData(cached.data);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const promise = getCharacterDataAction(roomId, senderId)
      .then((data) => {
        setCacheEntry(cacheKey, { data, promise: undefined });
        return data;
      })
      .catch((err) => {
        console.error("Failed to fetch character data for tooltip:", err);
        characterCache.delete(cacheKey);
        return null;
      });

    setCacheEntry(cacheKey, { data: null, promise });

    promise.then((data) => {
      setCharData(data);
      setLoading(false);
    });
  };

  // Check request rendering
  if (type === "check_request") {
    type CheckInfo = {
      checkRequest?: {
        targetUserIds?: number[];
        skillName?: string;
        diceType?: string;
        respondedUserIds?: number[];
        proxiedUserIds?: number[];
        sanCheck?: { successExpr?: string; failureExpr?: string };
        shCheck?: { dc?: number | null; styleDice?: number };
        ghost?: boolean;
      };
    };
    const checkInfo = parsedDetail as CheckInfo | null;
    const cr = checkInfo?.checkRequest;
    const targetIds = cr?.targetUserIds ?? [];
    const respondedIds = cr?.respondedUserIds ?? [];
    const isTarget = userId !== undefined && targetIds.includes(userId);
    const alreadyResponded = userId !== undefined && respondedIds.includes(userId);
    const totalCount = targetIds.length;
    const doneCount = respondedIds.length;
    const checkState: "target-pending" | "target-done" | "viewer" = isTarget
      ? alreadyResponded ? "target-done" : "target-pending"
      : "viewer";
    const allDone = totalCount > 0 && doneCount >= totalCount;
    const pendingIds = targetIds.filter((id) => !respondedIds.includes(id));
    // Derive request category for theming. sanity = carries sanCheck or 理智值
    // as skillName; ghost = explicit gm-private announcement; otherwise plain skill.
    const isSanity = !!cr?.sanCheck || cr?.skillName === "理智值";
    const isGhost = !!cr?.ghost;
    const checkKind: "skill" | "sanity" | "gm-private" = isGhost ? "gm-private" : isSanity ? "sanity" : "skill";
    // Host-side proxy: render a seal button so the host can roll on behalf of an
    // absent target. Skipped for gm-private (host-side from the start) and when
    // the host is also a target (their own dice button takes precedence).
    const canProxy =
      !!onProxyCheckRequest &&
      checkKind !== "gm-private" &&
      checkState !== "target-pending" &&
      pendingIds.length > 0 &&
      messageId !== undefined;
    const highlightToken =
      checkKind === "sanity" ? t("sanityCheckLabel")
      // skill + gm-private both pull the skill label straight from the request
      // (e.g. ".rc 心理学" → highlights "心理学").
      : (cr?.skillName ?? null);
    const KindIcon =
      checkKind === "sanity" ? Icons.Droplet
      : checkKind === "gm-private" ? Icons.Eye
      : Icons.Target;
    const sanInline = checkKind === "sanity" && cr?.sanCheck
      ? t("scExprInline", {
          successExpr: cr.sanCheck.successExpr ?? "0",
          failureExpr: cr.sanCheck.failureExpr ?? "0",
        })
      : null;
    // Rule-specialized request (狩魂者): surface the DC (host value or the
    // rule default 10) and the host-announced style dice, signed.
    const shStyle = cr?.shCheck?.styleDice ?? 0;
    const shInline = cr?.shCheck
      ? t("shCheckInline", {
          dc: cr.shCheck.dc ?? 10,
          style: shStyle > 0 ? `+${shStyle}` : `${shStyle}`,
        })
      : null;

    return (
      <div
        className={`check-request flex justify-center py-2 ${pillEnterClass}`}
        data-state={checkState}
        data-check-kind={checkKind}
        data-complete={allDone ? "true" : undefined}
      >
        <div className={`check-request-body flex items-center gap-2 px-4 py-2 rounded-full ${
          checkState === "target-pending" ? "bg-accent/10 border border-accent/30" : "bg-surface-alt"
        }`}>
          <KindIcon className="check-request-kind-icon w-4 h-4 text-accent shrink-0" />
          <span className="check-request-text text-sm text-text">
            {renderCheckRequestContent(content, highlightToken)}
            {sanInline && <span className="check-request-sc-expr">{sanInline}</span>}
            {shInline && <span className="check-request-sh-expr text-text-muted">{shInline}</span>}
          </span>
          {totalCount > 0 && (
            <span className="check-request-progress text-xs text-text-muted whitespace-nowrap inline-flex items-center gap-1">
              {checkState === "target-done" || allDone ? (
                <Icons.Check className="check-request-progress-icon w-3 h-3 text-success" aria-hidden />
              ) : null}
              {renderCheckProgress(t("checkProgress", { done: doneCount, total: totalCount }))}
            </span>
          )}
          {checkKind === "gm-private" ? (
            <span className="check-request-ghost-badge inline-flex items-center gap-1 text-[11px] text-text-dim border border-border rounded-full px-2 py-0.5">
              <Icons.Lock className="w-3 h-3" />
              {t("ghostRollBadge")}
            </span>
          ) : checkState === "target-pending" && onCheckRequest && messageId !== undefined ? (
            <button
              onClick={() => onCheckRequest(messageId, cr?.skillName ?? "", cr?.shCheck ? { bonusDicePrompt: true } : undefined)}
              className="check-request-button bg-accent hover:bg-accent-hover text-accent-foreground w-8 h-8 rounded-full flex items-center justify-center transition attention-bounce shadow-[var(--theme-glow)]"
              title={t("clickCheck")}
            >
              <Icons.Dices className="w-4 h-4" />
            </button>
          ) : checkState === "target-done" ? (
            <Icons.Check className="check-request-done w-4 h-4 text-success" aria-label={t("checkDone")} />
          ) : !canProxy ? (
            <Icons.Dices className="check-request-icon w-4 h-4 text-accent shrink-0" aria-hidden />
          ) : null}
          {canProxy && (
            <div ref={proxyAnchorRef} className="check-request-proxy relative inline-flex">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Single pending target → fire immediately, no popover.
                  if (pendingIds.length === 1) {
                    onProxyCheckRequest!(messageId!, pendingIds[0]);
                    return;
                  }
                  // Multi-pending → open the popover and lazy-load targets.
                  setProxyOpen((open) => !open);
                  if (!proxyOpen && onLoadProxyTargets) {
                    setProxyLoading(true);
                    onLoadProxyTargets(messageId!).then((r) => {
                      if (r.success && r.targets) setProxyTargets(r.targets);
                      setProxyLoading(false);
                    }).catch(() => setProxyLoading(false));
                  }
                }}
                className="check-request-proxy-btn inline-flex items-center justify-center w-7 h-7 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition shrink-0"
                title={t("proxyRoll")}
                aria-label={t("proxyRoll")}
                aria-expanded={proxyOpen}
                data-state={proxyOpen ? "open" : "closed"}
              >
                <Icons.Stamp className="w-3.5 h-3.5" />
              </button>
              {proxyOpen && pendingIds.length > 1 && (
                <div className="check-request-proxy-popover absolute top-full mt-2 left-1/2 -translate-x-1/2 z-30 min-w-[260px] bg-surface border border-border rounded-theme shadow-2xl py-1.5 animate-in fade-in zoom-in-95">
                  <div className="check-request-proxy-header flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-muted border-b border-border/60">
                    <Icons.Stamp className="w-3 h-3" />
                    <span>{t("proxyRollHeader", { skillName: cr?.skillName ?? "" })}</span>
                  </div>
                  {proxyLoading && !proxyTargets ? (
                    <div className="px-3 py-3 text-xs text-text-dim flex items-center gap-2">
                      <Icons.Loader2 className="w-3 h-3 animate-spin" />
                      {t("loading")}
                    </div>
                  ) : (
                    <div className="py-1">
                      {(proxyTargets ?? pendingIds.map((id) => ({ userId: id, nickname: `#${id}`, value: null as number | null }))).map((target) => {
                        const missing = target.value == null;
                        return (
                          <button
                            key={target.userId}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Missing skill is allowed — the server falls back to a raw
                              // d100 attributed to the player (no success/failure grading).
                              onProxyCheckRequest!(messageId!, target.userId);
                              setProxyOpen(false);
                            }}
                            className="check-request-proxy-row w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-text hover:bg-surface-alt transition cursor-pointer"
                            data-missing={missing ? "true" : undefined}
                          >
                            <span
                              className="check-request-proxy-avatar w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                              style={{
                                backgroundColor: getRandomColorForUser(target.userId),
                                color: getContrastColor(getRandomColorForUser(target.userId)),
                              }}
                            >
                              {target.nickname.charAt(0).toUpperCase()}
                            </span>
                            <span className="flex-1 truncate">{target.nickname}</span>
                            <span
                              className={`check-request-proxy-tag text-[11px] font-theme-mono px-1.5 py-0.5 rounded ${
                                missing
                                  ? "bg-warning/15 text-warning border border-warning/30"
                                  : "bg-surface-alt text-text-dim"
                              }`}
                              title={missing ? t("proxyRawRollHint") : undefined}
                            >
                              {missing ? t("proxyRawRoll") : `${cr?.skillName ?? ""} · ${target.value}`}
                            </span>
                            <Icons.Dices className={`w-3.5 h-3.5 shrink-0 ${missing ? "text-warning" : "text-primary"}`} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === "system") {
    // Help renders as a structured 2-column card, not a pill.
    if (systemKind === "help") {
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="help">
          <HelpCard visSelfLabel={t("visSelf")} />
        </div>
      );
    }
    // Inventory dispatch: structured icon + chip pill driven by `diceDetail`.
    if (systemKind === "inventory-dispatch") {
      return <DispatchPill content={content} diceDetail={diceDetail} enter={entered} />;
    }
    // Inventory receipt: recipient-side notification with NEW/更新 badge + 查看背包 CTA.
    if (systemKind === "inventory-receipt") {
      return <ReceiptPill content={content} diceDetail={diceDetail} onOpenInventory={onOpenInventory} enter={entered} />;
    }
    // Event announcement card — locked/unlocked/retracted decided client-side.
    if (systemKind === "event-card") {
      const payload = parseEventCardPayload(diceDetail);
      if (!payload) return null;
      const unlocked = isHost || !!visibleEventIds?.has(payload.eventId);
      return (
        <div className={`flex justify-center py-2 ${pillEnterClass}`}>
          <EventCard payload={payload} unlocked={unlocked} roomId={roomId} onOpen={() => onOpenEvent?.(payload.eventId)} />
        </div>
      );
    }
    // Event receipt: a personal "you got a new event" pill opening its detail modal.
    if (systemKind === "event-receipt") {
      const r = parseEventReceiptPayload(diceDetail);
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-kind="event-receipt">
          <button
            onClick={() => r && onOpenEvent?.(r.eventId)}
            className="system-pill-body inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full text-primary bg-primary/10 border border-primary/30 hover:bg-primary/20 transition cursor-pointer"
          >
            <Icons.ScrollText className="w-3.5 h-3.5" />
            <span>{r ? t("eventReceipt", { title: r.title }) : content}</span>
          </button>
        </div>
      );
    }
    // Timeline divider: host date separator, with a host-only withdraw affordance.
    if (systemKind === "timeline-divider") {
      return (
        <TimelineDivider
          data={parseTimelinePayload(diceDetail)}
          fallback={content}
          isHost={isHost}
          onWithdraw={
            isHost && onWithdrawTimeline && messageId !== undefined
              ? () => onWithdrawTimeline(messageId)
              : undefined
          }
        />
      );
    }
    // Legacy multi-line messages keep the block-card fallback (no system_kind set).
    const isBlock = !systemKind && content.includes("\n");
    if (isBlock) {
      return (
        <div className={`system-pill flex justify-center py-2 ${pillEnterClass}`} data-block="true">
          <div className="system-pill-body bg-surface-alt border border-border rounded-theme px-4 py-3 text-sm text-text max-w-lg text-left">
            <SystemPillContent content={content} block />
          </div>
        </div>
      );
    }
    // Kind-tagged pill (st / error / room-event / scene-marker) or the default
    // neutral pill. `help` is already handled above, so by here `systemKind` is
    // either one of the four pill kinds or null/undefined.
    const meta = systemKind ? SYSTEM_PILL_META[systemKind] : null;
    const KindIcon = meta?.icon;
    return (
      <div
        className={`system-pill flex justify-center py-2 ${pillEnterClass}`}
        data-kind={systemKind ?? undefined}
      >
        <span
          className={`system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full ${
            meta
              ? `${meta.className} not-italic`
              : "text-text-dim bg-surface-alt"
          }`}
        >
          {KindIcon && <KindIcon className="w-3.5 h-3.5 system-pill-icon" />}
          <span className="system-pill-text">
            {systemKind === "scene-marker" ? `— ${content} —` : content}
          </span>
        </span>
      </div>
    );
  }

  const isDice = type === "dice";
  const isImage = type === "image";
  const isSticker = type === "sticker";
  const diceMeta = isDice ? parseDiceMeta(parsedDetail as DiceMetaSource) : null;
  // Extract command echo + roll kind from diceDetail so they can be lifted out
  // of the bubble: echo into the header line, kind onto a data-attr for theming.
  let diceCommandEcho: string | null = null;
  let diceRollKind: RollKind = "plain";
  let diceCardKind: "sanity" | "breakdown" | "pool" | "bp" | "d20" | null = null;
  let diceProxyNick: string | null = null;
  let diceAnnouncer: { userId: number; nickname: string; quip?: string; quipPending?: boolean } | null = null;
  if (isDice && parsedDetail) {
    const d = parsedDetail as DiceDetailJson & {
      proxiedByNickname?: string;
      announcer?: { userId: number; nickname: string; quip?: string; quipPending?: boolean };
    };
    if (typeof d.command === "string" && d.command.trim()) {
      diceCommandEcho = d.command.trim();
    }
    diceRollKind = getRollKind(d);
    diceCardKind = diceCardType(d);
    if (typeof d.proxiedByNickname === "string" && d.proxiedByNickname) {
      diceProxyNick = d.proxiedByNickname;
    }
    if (d.announcer) {
      diceAnnouncer = d.announcer;
    }
  }

  // 投娘 (dice announcer): re-skin the card's avatar/name under the bot's
  // identity. The message keeps its real ownership (audience/isOwn/etc. all
  // stay keyed on the roller) — only the header visuals swap.
  const announcerMember = diceAnnouncer
    ? players?.find((p) => (p.users?.id ?? p.user?.id ?? p.user_id) === diceAnnouncer!.userId)
    : undefined;
  const displayNickname = diceAnnouncer ? diceAnnouncer.nickname : nickname;
  const displayAvatar = diceAnnouncer ? announcerMember?.room_members?.avatar ?? null : avatar;
  const displayAvatarColor = diceAnnouncer ? announcerMember?.room_members?.avatarColor ?? null : avatarColor;
  const displayIsBot = diceAnnouncer ? true : isBot;

  // Visibility badge shown next to the nickname. Driven by the message audience
  // (not the legacy isPrivate flag) so a DM whisper isn't mislabelled as a GM
  // hidden roll. `everyone` shows nothing; system/clue notices render elsewhere.
  const visibilityBadge =
    audience === "self" ? t("visSelf")
    : audience === "dm" ? t("visDm")
    : audience === "directed" ? t("visDirected")
    : audience === "gm" ? t("visGm", { host: hostLabel })
    : null;

  return (
    <div className={`flex gap-3 py-1.5 group ${rowEnterClass} ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar Wrapper */}
      <div
        ref={avatarRef}
        className="relative shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
          setIsHovered(false);
        }}
      >
        {displayAvatar ? (
          // Avatar is a base64 data URL — next/image can't optimize these.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayAvatar}
            alt={displayNickname}
            className={`w-8 h-8 rounded-theme flex-shrink-0 transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-theme flex items-center justify-center text-xs font-bold transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
            style={{
              backgroundColor: displayAvatarColor || getRandomColorForUser((diceAnnouncer ? diceAnnouncer.userId : senderId) || 0),
              color: getContrastColor(displayAvatarColor || getRandomColorForUser((diceAnnouncer ? diceAnnouncer.userId : senderId) || 0)),
            }}
          >
            {displayNickname.charAt(0).toUpperCase()}
          </div>
        )}

        {isHovered && canView && (
          <ResourceStatusTooltip
            loading={loading}
            charData={charData}
            nickname={nickname}
            coords={coords}
          />
        )}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""} relative`}>
          <span
            className={`text-[13px] font-semibold text-text-muted inline-flex items-center gap-1 ${(!displayIsBot && !isOwn && senderId) ? "cursor-pointer hover:underline select-none" : ""}`}
            onClick={(e) => {
              if (!displayIsBot && !isOwn && senderId) {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }
            }}
          >
            {displayNickname}
            {displayIsBot && <Icons.Bot className="w-3.5 h-3.5 text-ai" aria-label="Bot" />}
          </span>
          {diceAnnouncer && (
            <span
              className="dice-announcer-chip inline-flex items-center gap-1 text-[10px] text-ai border border-dashed border-ai/50 bg-ai/[0.06] rounded px-1.5 py-0.5"
              title={t("announcerBadgeTitle", { nickname: diceAnnouncer.nickname })}
            >
              <Icons.Bot className="w-3 h-3" />
              {t("announcerBadge")}
            </span>
          )}
          {!diceAnnouncer && senderId !== undefined && hostId !== undefined && senderId === hostId && (
            <span className="text-[10px] font-bold text-ai bg-ai/15 border border-ai/30 px-1.5 py-0.5 rounded">
              {hostLabel}
            </span>
          )}
          {isDice && diceProxyNick && (
            <span
              className="dice-proxy-chip inline-flex items-center gap-1 text-[10px] text-primary border border-dashed border-primary/60 bg-primary/[0.06] rounded px-1.5 py-0.5"
              title={t("proxyRolledByTitle", { hostNick: diceProxyNick, host: hostLabel })}
            >
              <Icons.Stamp className="w-3 h-3" />
              {t("proxyRolledBy", { hostNick: diceProxyNick })}
            </span>
          )}
          {isDice && diceMeta?.psy ? (
            // Psychology hidden roll: header shows eye icon + the rule's "仅 <主持人> 可见" + the
            // descriptive content line ("守秘人对 苏雨 进行心理学检定"). Replaces
            // both the regular visibility badge and the command echo.
            <span className="dice-psy-header inline-flex items-center gap-1 text-[11px] text-text-dim">
              <Icons.Eye className="w-3 h-3" />
              {t("visKpOnly", { host: hostLabel })} · <span className="dice-psy-desc">{content}</span>
            </span>
          ) : (
            <>
              {visibilityBadge && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
                  <Icons.Lock className="w-3 h-3" />{visibilityBadge}
                </span>
              )}
              {diceCommandEcho && (
                <span className="dice-echo text-[11px] text-text-dim font-theme-mono">
                  「{diceCommandEcho}」
                </span>
              )}
            </>
          )}

          {showMenu && senderId && (
            <div
              className={`absolute bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[120px] z-30 animate-in fade-in zoom-in-95 ${
                isOwn ? "right-0" : "left-0"
              }`}
              style={{ top: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isHost && onViewCharacter && (
                <button
                  onClick={() => {
                    onViewCharacter(senderId, nickname);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  {tRoom("btnViewCard")}
                </button>
              )}
              {onStartDM && (
                <button
                  onClick={() => {
                    onStartDM(senderId);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Icons.Lock className="w-3.5 h-3.5" /> {tRoom("btnDm")}
                </button>
              )}
            </div>
          )}

          <span className="text-[11px] text-text-dim opacity-0 group-hover:opacity-100 transition">
            {mounted ? formatTime(createdAt, t) : ""}
          </span>
        </div>

        {diceAnnouncer && (
          <div className={`dice-announcer-roller text-[11px] text-text-dim mb-0.5 ${isOwn ? "text-right" : ""}`}>
            <span className="font-bold text-text">{nickname}</span> {t("announcerRollerSuffix")}
          </div>
        )}

        <div
          className={`chat-bubble ${isOwn ? "chat-bubble-own" : "chat-bubble-other"} ${
            isDice ? "chat-bubble-dice" : isPrivate ? "chat-bubble-private" : isSticker ? "chat-bubble-sticker" : isImage ? "chat-bubble-image" : "chat-bubble-text"
          } break-words transition-colors ${isSticker ? "" : "rounded-theme shadow-sm"} ${isSticker ? "p-0" : isImage ? "p-1" : "px-3 py-2"} ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isSticker
              ? ""
              : isImage
              ? "bg-surface border border-border text-text"
              : isOwn
              ? "bg-primary/10 border border-primary/40 text-text"
              : "bg-surface border border-border text-text"
          } ${entered && isDice ? "dice-flourish" : ""}`}
          data-grade={isDice ? diceMeta?.grade : undefined}
          data-kind={isDice ? diceMeta?.kind : undefined}
          data-roll-kind={isDice ? diceRollKind : undefined}
          data-layout={isDice ? (diceCardKind ? "card" : "inline") : undefined}
          data-card={isDice ? (diceCardKind ?? undefined) : undefined}
          data-audience={isDice ? (audience ?? "everyone") : undefined}
          data-insanity={isDice && diceMeta?.insanity ? "true" : undefined}
          data-psy={isDice && diceMeta?.psy ? "true" : undefined}
        >
          {isDice ? (
            diceCardKind !== null ? (
              // Card layouts (理智 / 狩魂 / pool) render their own header/body —
              // no outer flex/icon wrapper.
              <DiceResultDisplay diceDetail={diceDetail || content} preParsed={diceDetail ? (parsedDetail as DiceDetailJson | null) : undefined} fallback={content} t={t} />
            ) : (
              <div className="dice-bubble flex items-center gap-2 flex-wrap">
                <span className="dice-icon flex items-center justify-center w-7 h-7 rounded-theme bg-primary/10 text-primary border border-primary/30 shrink-0">
                  <RollIcon kind={diceRollKind} grade={diceMeta?.grade ?? "none"} psy={diceMeta?.psy} />
                </span>
                <span className="dice-result inline-flex items-baseline gap-1 font-theme-mono text-sm leading-tight flex-wrap">
                  <DiceResultDisplay diceDetail={diceDetail || content} preParsed={diceDetail ? (parsedDetail as DiceDetailJson | null) : undefined} fallback={content} t={t} />
                </span>
              </div>
            )
          ) : isSticker ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-dim italic">
                <Icons.Smile className="w-4 h-4 not-italic" />
                <span>{t("stickerUnavailable")}</span>
              </div>
            ) : (
              // Sticker is served from an arbitrary /api path with an onError fallback — next/image adds no value here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={content}
                alt={t("stickerAlt")}
                loading="lazy"
                onError={() => setImgError(true)}
                className="max-h-32 max-w-full w-auto object-contain select-none"
                draggable={false}
              />
            )
          ) : isImage ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-text-dim italic">
                <Icons.Image className="w-4 h-4 not-italic" />
                <span>{t("imageUnavailable")}</span>
              </div>
            ) : (
              <>
                {/* Chat image is a user-supplied URL (internal /api path or arbitrary external https) — next/image
                    would require enumerating remotePatterns for domains we cannot know ahead of time. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={content}
                  alt={t("imageAlt")}
                  loading="lazy"
                  onError={() => setImgError(true)}
                  onClick={() => setPreviewOpen(true)}
                  className="max-h-64 max-w-full w-auto rounded-theme object-contain cursor-zoom-in"
                />
                {previewOpen && (
                  <ImagePreview src={content} alt={t("imageAlt")} onClose={() => setPreviewOpen(false)} />
                )}
              </>
            )
          ) : (
            <MarkdownRenderer content={content} />
          )}

          {isDice && diceAnnouncer && (
            diceAnnouncer.quip ? (
              <div className="dice-announcer-quip mt-1.5 pt-1.5 border-t border-dice-card-border/60 text-xs italic text-text-dim">
                “{diceAnnouncer.quip}”
              </div>
            ) : showQuipPlaceholder ? (
              <div className="dice-announcer-quip mt-1.5 pt-1.5 border-t border-dice-card-border/60 text-xs italic text-text-dim animate-pulse">
                ···
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
});
