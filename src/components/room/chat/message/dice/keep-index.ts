import type { DiceTerm } from "./dice-types";

/** Kept-dice positions for a kN term, matched as a multiset against `keptRolls`
 *  (so duplicate faces resolve correctly). null when it isn't a keep roll. */
export function keptIndexSet(term: Extract<DiceTerm, { count: number }>): Set<number> | null {
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
