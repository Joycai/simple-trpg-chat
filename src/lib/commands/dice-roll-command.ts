import { db } from "@/db";
import { rooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatDiceRollMessage, parseAndRollExpression } from "@/lib/commands/expression";
import { getRuleForRoom } from "@/lib/rules";
import type { CommandResult, CommandContext } from "./command-types";
import { attachProxy, visibilityFor, emitCommandMessage } from "./command-message";
import { runRuleCheck } from "./check-roll-command";

/** .rd / .r / .rh — roll a dice expression. `.rh` is hidden (only the roller sees it). */
export async function handleDiceRoll(
  roomId: number,
  userId: number,
  rawArgs: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  hidden: boolean,
  rawCommand: string
): Promise<CommandResult> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rule = getRuleForRoom(room || {});

  // Rule-special plain rolls get the very first claim — COC's `.rd100b2`
  // bonus/penalty roll would otherwise be mangled by the numeric-prefix
  // rewrite below ("100b2" → "1d100b2" → parse error). Hidden rolls are
  // included on purpose: `.rh100b2` is a legitimate 暗投.
  if (rawArgs.trim() && rule.resolvePlainRoll) {
    const special = rule.resolvePlainRoll(rawArgs.trim());
    if (special) {
      const content = `🎲 ${special.notation}: ${special.display} = ${special.total}`;
      const vis = hidden
        ? visibilityFor(ctx, userId, "self")
        : visibilityFor(ctx, userId, "channel");
      const detail = attachProxy(
        JSON.stringify({ ...special.detail, command: rawCommand }),
        ctx?.proxiedBy
      );
      const msg = await emitCommandMessage(roomId, userId, content, "dice", vis, detail, undefined, {
        notation: special.notation,
        resultText: content,
      });
      return { success: true, isCommand: true, message: msg };
    }
  }

  // Give the rule first refusal on non-empty args: 狩魂者 claims `.r+x±y [DC]`
  // as a nameless shorthand check. Hidden rolls (`.rh`) stay plain dice.
  if (!hidden && rawArgs.trim() && rule.parseQuickCheckArgs) {
    const quick = rule.parseQuickCheckArgs(rawArgs.trim());
    if (quick) {
      return await runRuleCheck(roomId, userId, quick, rule, t, ctx, rawCommand);
    }
  }

  let args = rawArgs;
  if (!args.trim()) {
    // No args → use the rule's default die (COC/basic = 1d100, dnd5e = 1d20,
    // triangle = 6d4).
    args = rule.capabilities.defaultRollExpression;
  } else if (/^\d+(?![dD])/.test(args.trim())) {
    args = "1d" + args.trim();
  }

  const rollResult = parseAndRollExpression(args, t);
  if (!rollResult.success) {
    return { success: false, isCommand: true, error: rollResult.error };
  }

  const { content: rollMsgContent, diceDetail } = formatDiceRollMessage(
    rollResult.notation,
    rollResult.terms,
    rollResult.totalSum,
    t,
    rawCommand,
    rule.capabilities.highlightDieFace
  );

  const vis = hidden
    ? visibilityFor(ctx, userId, "self")
    : visibilityFor(ctx, userId, "channel");

  const taggedDetail = attachProxy(diceDetail, ctx?.proxiedBy);
  const msg = await emitCommandMessage(roomId, userId, rollMsgContent, "dice", vis, taggedDetail, undefined, {
    notation: rollResult.notation,
    resultText: rollMsgContent,
  });
  return { success: true, isCommand: true, message: msg };
}
