import { getTranslations } from "next-intl/server";
import type { CommandResult, CommandContext } from "./command-types";
import { visibilityFor, emitCommandMessage } from "./command-message";
import { handleDiceRoll } from "./dice-roll-command";
import { handleSetSkill } from "./set-skill-command";
import { handleRollCheck } from "./check-roll-command";
import { handleSanityCheck } from "./sanity-check-command";

export { syncCharacterStat, syncCharacterSanity } from "./character-stat-sync";
export type { CommandResult, CommandContext } from "./command-types";

/** Known commands, used for "did you mean …?" suggestions on typos. */
const KNOWN_COMMANDS = ["help", "st", "rc", "ra", "rch", "rah", "rh", "rd", "r", "sc"];

/** Minimal edit distance for typo suggestions. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Build the "unknown command" error, appending a guess when the typo is close. */
function unknownCommandError(rawInput: string, t: (key: string, opts?: Record<string, string | number | Date>) => string): string {
  const token = (rawInput.match(/^[a-zA-Z]+/)?.[0] || "").toLowerCase();
  if (token) {
    let best = "";
    let bestDist = Infinity;
    for (const cmd of KNOWN_COMMANDS) {
      const d = levenshtein(token, cmd);
      if (d < bestDist) { bestDist = d; best = cmd; }
    }
    if (best && bestDist > 0 && bestDist <= 2) {
      return t("unknownCommandGuess", { guess: `.${best}` });
    }
  }
  return t("unknownCommand");
}

/**
 * Command Engine
 * Handles .st, .rc, .ra, .rd, .r, .rh, .sc, .help
 */
export async function executeCommand(
  roomId: number,
  userId: number,
  content: string,
  ctx?: CommandContext
): Promise<CommandResult> {
  const trimmed = content.trim();
  if (!trimmed.startsWith(".") && !trimmed.startsWith("。")) {
    return { success: true, isCommand: false };
  }

  const t = await getTranslations("commands");

  const body = trimmed.slice(1);
  // Regex matches: command prefix + optional spaces + arguments.
  // NOTE: order matters — alternation is left-to-right. Longer variants must
  // precede their prefixes (`rch`/`rah` before `rc`/`ra`/`rh`, those before
  // the bare `r`) so `.rch侦查` / `.ra侦查` / `.rh100` aren't swallowed by a
  // shorter command.
  const match = body.match(/^(help|st|rch|rah|rc|sc|rd|ra|rh|r)\s*(.*)$/i);
  if (!match) {
    return { success: false, isCommand: true, error: unknownCommandError(body, t) };
  }

  const cmd = match[1].toLowerCase();
  const args = match[2] || "";

  // --- .rd / .r / .rh (Dice roll expressions) ---
  if (cmd === "rd" || cmd === "r" || cmd === "rh") {
    return await handleDiceRoll(roomId, userId, args, t, ctx, cmd === "rh", trimmed);
  }

  // --- .st (Set Skill / Attribute / Resource) ---
  if (cmd === "st") {
    return await handleSetSkill(roomId, userId, args, t, ctx);
  }

  // --- .rc / .ra (Roll Check — identical variants per spec) and their
  // hidden twins .rch / .rah (same check, result visible only to the roller —
  // the check-flow counterpart of `.rh`) ---
  if (cmd === "rc" || cmd === "ra" || cmd === "rch" || cmd === "rah") {
    return await handleRollCheck(roomId, userId, args, t, ctx, trimmed, cmd === "rch" || cmd === "rah");
  }

  // --- .sc (Sanity Check) ---
  if (cmd === "sc") {
    return await handleSanityCheck(roomId, userId, args, t, ctx, trimmed);
  }

  // --- .help ---
  if (cmd === "help") {
    // Content is a flat fallback; when system_kind === 'help' the client
    // renders the structured table by mapping the room rule's
    // `capabilities.helpEntryIds` over the `commands.helpEntries` i18n map,
    // so each rule template documents exactly the commands it honors.
    const helpText = t("helpTitle");
    const vis = visibilityFor(ctx, userId, "self");
    const msg = await emitCommandMessage(roomId, userId, helpText, "system", vis, undefined, "help");
    return { success: true, isCommand: true, message: msg };
  }

  return { success: false, isCommand: true, error: t("unknownCommand") };
}
