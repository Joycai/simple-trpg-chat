"use client";

import { Icons } from "@/components/shared/icons";
import type { DiceGrade, DiceTerm, RollKind } from "./dice-types";
import { padD100 } from "./dice-format";
import { keptIndexSet } from "./keep-index";

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
export function DiceResultGrade({
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

/** Sample 1 — inline plain roll: each term's dice **count** is highlighted, and
 *  for kN rolls the **kept** dice are picked out inside the [ ] array (dropped
 *  dice dimmed). Replaces the old "(保留[…])" trailer. */
export function StructuredRoll({ terms, sum, isD100 }: { terms: DiceTerm[]; sum: number | undefined; isD100: boolean }) {
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
