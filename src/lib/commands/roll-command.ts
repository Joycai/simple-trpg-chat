/**
 * Pure helpers for recognizing dice-roll chat commands on the client.
 *
 * Kept separate from `commands.ts` on purpose: that module imports the DB
 * layer, so client components must never import it. The prefix list below
 * mirrors the roll-type subset of the engine's command regex
 * (`commands.ts` — `/^(help|st|rch|rah|rc|sc|rd|ra|rh|r)\s*(.*)$/i`),
 * excluding non-roll commands (`st`, `help`).
 */

// Longer prefixes must precede their prefixes (`rch`/`rah` before `rc`/`ra`/
// `rh`, all before the bare `r`), matching the engine's left-to-right
// alternation so `.rch侦查` / `.ra侦查` / `.rh100` aren't read as `.r`.
export const ROLL_COMMANDS = ["rch", "rah", "rd", "ra", "rh", "rc", "sc", "r"] as const;

const ROLL_COMMAND_RE = new RegExp(`^(${ROLL_COMMANDS.join("|")})\\s*(.*)$`, "i");

/** True if the input is a roll-type command (`.r/.rd/.rh/.rc/.ra/.sc`, `。` prefix accepted). */
export function isRollCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith(".") && !trimmed.startsWith("。")) return false;
  // Non-roll commands (`st`, `help`) never collide with the roll prefixes,
  // so a plain anchored alternation is enough.
  return ROLL_COMMAND_RE.test(trimmed.slice(1));
}

/** Canonical form for history storage: trim, `。`→`.`, collapse inner whitespace. */
export function normalizeRollCommand(input: string): string {
  let s = input.trim();
  if (s.startsWith("。")) s = "." + s.slice(1);
  return s.replace(/\s+/g, " ");
}

/**
 * Pure recent-history update: move-to-front dedupe, capped at `max`.
 * Returns a new array; never mutates `list`.
 */
export function pushRecent(list: readonly string[], cmd: string, max = 5): string[] {
  return [cmd, ...list.filter((c) => c !== cmd)].slice(0, max);
}

/**
 * Parse the leading `NdM` term of a roll expression into a dice-panel
 * selection. Fed the active rule's `capabilities.defaultRollExpression`
 * ("1d100" for COC, "1d20" for DnD 5e / 狩魂者, "6d4" for Triangle Agency) so
 * the 🎲 panel opens pre-set to whatever the room's ruleset rolls by default.
 *
 * Only the first `NdM` term is read — a rule whose default is a compound
 * expression still yields a sensible single-die starting point. Returns
 * `null` when no `NdM` term is present (or the count/faces are non-positive),
 * letting the caller keep its own fallback. `count` is clamped to 1..`maxCount`.
 */
export function parseLeadingDice(
  expression: string | null | undefined,
  maxCount = 20,
): { count: number; faces: number } | null {
  if (!expression) return null;
  const m = /(\d+)\s*[dD]\s*(\d+)/.exec(expression);
  if (!m) return null;
  const rawCount = parseInt(m[1], 10);
  const faces = parseInt(m[2], 10);
  if (!Number.isFinite(rawCount) || !Number.isFinite(faces) || rawCount < 1 || faces < 1) {
    return null;
  }
  return { count: Math.min(maxCount, Math.max(1, rawCount)), faces };
}
