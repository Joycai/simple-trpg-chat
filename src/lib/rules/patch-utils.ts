/**
 * Shared sanitizers for `RuleModule.applySheetPatch`.
 *
 * Every rule receives the same untrusted input — a JSON blob the LLM produced
 * while calling `set_character_card` — so the "round it, bound it, drop keys I
 * never declared" work is identical across rules and only the ranges differ.
 * Keeping it here means a new rule writes ranges, not validation logic, and
 * can't accidentally ship a laxer check than its neighbors.
 *
 * React-free like the rest of `src/lib/rules` — these run on the server.
 */

import type { AttributeKeySpec } from "./types";

/**
 * Round and bound an untrusted number. Anything non-numeric (a string, null,
 * NaN, the model apologizing in prose) collapses to `fallback` rather than
 * poisoning the sheet with a NaN that would render as blank forever.
 */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/**
 * Whitelist an attribute bag against the keys the rule actually declares, then
 * clamp each surviving value. Returns `null` when `patch` isn't an object, so
 * callers can distinguish "model didn't touch attributes" from "model sent an
 * empty object".
 *
 * The whitelist matters because the model reliably invents near-miss keys
 * ("strength" for `str`, "STR", "Luck") that would otherwise persist as dead
 * weight the sheet UI never renders.
 */
export function clampAttributes(
  patch: unknown,
  allowed: ReadonlyArray<AttributeKeySpec>,
  min: number,
  max: number,
  fallback: number,
): Record<string, number> | null {
  if (!patch || typeof patch !== "object") return null;
  const keys = new Set(allowed.map(k => k.key));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!keys.has(k)) continue;
    out[k] = clampInt(v, min, max, fallback);
  }
  return out;
}
