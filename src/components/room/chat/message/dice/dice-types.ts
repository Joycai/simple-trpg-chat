/** diceDetail payload shapes and the theme-facing metadata read off them. */

/**
 * Theme-overridable dice metadata extracted from `diceDetail`.
 * Surfaces `kind` (roll/check/sanity), `grade` (success/failure/critical/fumble),
 * and an `insanity` flag onto `data-*` attributes so themes can style each
 * variant without re-parsing the JSON.
 */
export type DiceKind = "roll" | "check" | "sanity";
export type DiceGrade = "none" | "success" | "failure" | "critical" | "fumble";
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
export type DiceTerm =
  | { sign: "+" | "-"; constant: number }
  | { sign: "+" | "-"; count: number; faces: number; keep?: number; rolls: number[]; keptRolls: number[] };

/** 狩魂者 structured breakdown for the card renderer. */
export type ShBreakdown = {
  base: number;
  bonus: { count: number; rolls: number[]; sum: number } | null;
  style: { count: number; rolls: number[]; sum: number } | null;
};

/** COC 奖励/惩罚骰 structured payload (shape mirrors `CocBpRoll` in
 *  rules/coc7th) — extra tens dice replace the original d100's tens digit;
 *  bonus keeps the lowest candidate, penalty the highest. */
export type CocBp = {
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
export type D20Check = {
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

export type DiceTFn = (key: string, opts?: Record<string, string | number | Date>) => string;
