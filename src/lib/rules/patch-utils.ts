/**
 * Shared number sanitizer for rule-owned parsing of untrusted input (quick-check
 * panel state, `ruleData` round-tripped through the engine). Sheet values are
 * validated by the generic `applySheetEdit` instead.
 *
 * React-free like the rest of `src/lib/rules` — these run on the server.
 */

/**
 * Round and bound an untrusted number. Anything non-numeric (a string, null,
 * NaN, the model apologizing in prose) collapses to `fallback` rather than
 * poisoning the sheet with a NaN that would render as blank forever.
 */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
