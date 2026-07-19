/**
 * Pure helpers for recognizing dice-roll chat commands on the client.
 *
 * Kept separate from `commands.ts` on purpose: that module imports the DB
 * layer, so client components must never import it. The prefix list below
 * mirrors the roll-type subset of the engine's command regex
 * (`commands.ts` — `/^(help|st|rc|sc|rd|ra|rh|r)\s*(.*)$/i`), excluding
 * non-roll commands (`st`, `help`).
 */

// Multi-letter prefixes must precede the bare `r`, matching the engine's
// left-to-right alternation so `.ra侦查` / `.rh100` aren't read as `.r`.
export const ROLL_COMMANDS = ["rd", "ra", "rh", "rc", "sc", "r"] as const;

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
