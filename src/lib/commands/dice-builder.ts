/**
 * Pure helpers behind the dice panel's combo tray.
 *
 * The panel is a builder, not a roller: everything here produces a dice
 * *expression string* (`2d6+1d4+2`) which the panel hands to `.r` / `.rh`, so
 * the actual rolling goes down the same server path as a typed command —
 * mixed dice, modifiers and `kN` all come from `parseAndRollExpression`
 * rather than being reimplemented client-side.
 *
 * Kept out of the component so the arithmetic is unit-testable.
 */

export interface DiceTerm {
  faces: number;
  count: number;
}

/** Terms print in ascending face order, so `1d4+2d6` never flips to `2d6+1d4`. */
const byFaces = (a: DiceTerm, b: DiceTerm) => a.faces - b.faces;

/** Hard ceiling per term — mirrors the panel's old MAX_COUNT. */
export const MAX_PER_TERM = 20;

const clampCount = (n: number) => Math.max(0, Math.min(MAX_PER_TERM, n));

/** Add `n` dice of a face, merging into the existing term for that face. */
export function addDie(terms: readonly DiceTerm[], faces: number, n = 1): DiceTerm[] {
  const existing = terms.find((x) => x.faces === faces);
  const next = existing
    ? terms.map((x) => (x.faces === faces ? { ...x, count: clampCount(x.count + n) } : x))
    : [...terms, { faces, count: clampCount(n) }];
  return next.filter((x) => x.count > 0).sort(byFaces);
}

/** Step one term up or down; hitting zero drops it from the tray. */
export function adjustTerm(terms: readonly DiceTerm[], faces: number, delta: number): DiceTerm[] {
  return terms
    .map((x) => (x.faces === faces ? { ...x, count: clampCount(x.count + delta) } : x))
    .filter((x) => x.count > 0)
    .sort(byFaces);
}

export function removeTerm(terms: readonly DiceTerm[], faces: number): DiceTerm[] {
  return terms.filter((x) => x.faces !== faces);
}

/** Modifiers are bounded so the expression can't grow past what `.r` accepts. */
export function setModifier(current: number, delta: number): number {
  return Math.max(-99, Math.min(99, current + delta));
}

/**
 * Render the tray as a dice expression. Empty tray ⇒ empty string, which the
 * panel uses to disable the roll button (`.r` with no args would silently fall
 * back to the rule's default die — not what an empty tray means).
 */
export function buildExpression(terms: readonly DiceTerm[], modifier = 0): string {
  const dice = [...terms].sort(byFaces).map((x) => `${x.count}d${x.faces}`);
  if (dice.length === 0) return "";
  let expr = dice.join("+");
  if (modifier > 0) expr += `+${modifier}`;
  else if (modifier < 0) expr += `${modifier}`; // the minus sign is already there
  return expr;
}

/** Inclusive [min, max] for a single term. */
export function termRange(term: DiceTerm): [number, number] {
  return [term.count, term.count * term.faces];
}

/** Inclusive [min, max] for the whole tray, modifier included. */
export function totalRange(terms: readonly DiceTerm[], modifier = 0): [number, number] {
  let lo = modifier;
  let hi = modifier;
  for (const term of terms) {
    const [a, b] = termRange(term);
    lo += a;
    hi += b;
  }
  return [lo, hi];
}

/** How many physical dice the tray throws — the roll button's label. */
export function diceCount(terms: readonly DiceTerm[]): number {
  return terms.reduce((sum, x) => sum + x.count, 0);
}

/**
 * Read an expression back into tray state, for the presets and the "last used"
 * chip. Deliberately lenient: anything it cannot understand (a `kN` keep, a
 * stray token) is skipped rather than rejected, because the tray is only a
 * convenience — the authoritative parse still happens server-side.
 */
export function parseExpression(expr: string): { terms: DiceTerm[]; modifier: number } {
  const terms: DiceTerm[] = [];
  let modifier = 0;
  const re = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr.replace(/\s+/g, ""))) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    if (m[3]) {
      const faces = Number(m[3]);
      const count = m[2] === "" ? 1 : Number(m[2]);
      // A negative die term has no meaning in the tray; take its magnitude.
      if (faces > 0 && count > 0) {
        const at = terms.find((x) => x.faces === faces);
        if (at) at.count = clampCount(at.count + count);
        else terms.push({ faces, count: clampCount(count) });
      }
    } else if (m[4]) {
      modifier += sign * Number(m[4]);
    }
  }
  return { terms: terms.filter((x) => x.count > 0).sort(byFaces), modifier: setModifier(0, modifier) };
}
