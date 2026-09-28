import { db, sqlNow } from "@/db";
import { roomSkills, rooms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { rollDie } from "@/lib/commands/dice";
import { parseAndRollExpression } from "@/lib/commands/expression";
import { getRule, getRuleForRoom } from "@/lib/rules";
import { applySheetEdit, statValue, type StatRef } from "@/lib/character/sheet-model";
import { parseSheetOrNull } from "@/lib/character/sheet-store";
import { updateSheetRow, type SheetRowStep } from "@/lib/character/sheet-row";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import type { CommandResult, CommandContext } from "./command-types";
import { attachProxy, visibilityFor, emitCommandMessage } from "./command-message";

/** .sc: Sanity Check */
export async function handleSanityCheck(
  roomId: number,
  userIdArg: number,
  args: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
  ctx: CommandContext | undefined,
  rawCommand: string
): Promise<CommandResult> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  if (!getRuleForRoom(room).capabilities.supportedCommands.includes("sc")) {
    // Gate via capabilities so future rules can enable/disable `.sc` without
    // touching the engine. Error key stays as-is for i18n continuity.
    return { success: false, isCommand: true, error: t("scNotCoc7th") };
  }

  // Parse arguments: success_deduction/failure_deduction
  const scMatch = args.trim().match(/^([0-9a-zA-Z+\-d\s]+)\s*\/\s*([0-9a-zA-Z+\-d\s]+)$/i);
  if (!scMatch) {
    return { success: false, isCommand: true, error: t("scUsageError") };
  }

  const successExpr = scMatch[1].trim();
  const failureExpr = scMatch[2].trim();

  // The check reads SAN and writes the loss under the member's row lock, so
  // the roll's target, the stored loss and the card's old → new are the same
  // value — a host editing SAN meanwhile is neither overwritten nor undone.
  const roomRuleId = room.ruleTemplate ?? "basic";
  const locked = await updateSheetRow(roomId, userIdArg, (raw): SheetRowStep<SanOutcome> => {
    const sheet = parseSheetOrNull(raw, roomRuleId);
    // Sanity is a rule capability, not a COC hardcode: any rule that declares
    // `hasSanity` has a `san` resource in its sheet schema.
    const rule = sheet ? getRule(sheet.ruleTemplate) : null;
    const oldSan = sheet && rule?.capabilities.hasSanity ? statValue(rule, sheet, SAN) : undefined;
    if (!sheet || !rule || typeof oldSan !== "number") return { result: { kind: "noSheetSan" } };
    const check = rollSanity(oldSan, successExpr, failureExpr, t);
    if (check.kind === "error") return { result: check };
    const next = applySheetEdit(rule, sheet, { resources: { san: { delta: -check.loss } } }).sheet;
    return { sheet: next, result: { ...check, newSan: statValue(rule, next, SAN) ?? oldSan - check.loss } };
  });

  let outcome: SanOutcome = locked.status === "notMember" ? { kind: "noSheetSan" } : locked.result;
  if (outcome.kind === "noSheetSan") {
    // No sanity on the sheet: a legacy room_skills(理智值) row, if any.
    const legacy = await readLegacySanity(roomId, userIdArg);
    if (legacy === null) {
      return { success: false, isCommand: true, error: t("scNoSanity"), code: "STAT_NOT_SET" };
    }
    outcome = rollSanity(legacy, successExpr, failureExpr, t);
  }
  if (outcome.kind === "error") return { success: false, isCommand: true, error: outcome.error };

  const { roll, isSuccess, rollResult, oldSan: currentSan, newSan: finalNewSan } = outcome;
  const resultLabel = isSuccess ? t("success") : t("failure");
  const deductVal = rollResult.totalSum;

  // Keep any legacy room_skills(理智值) row in sync for backward compatibility.
  await syncLegacySanitySkill(roomId, userIdArg, finalNewSan);
  // A host rolling on the player's behalf is the writer — the player's own
  // client must reload.
  await broadcastCharacterUpdate(roomId, userIdArg, { origin: ctx?.origin });

  // The insanity warning is now rendered client-side as a separate banner
  // attached to the sanity card (see chat/message/dice/DiceResultDisplay). The `deduction >= 5`
  // signal travels via diceDetail.sanityCheck.deduction, so no trailing text.
  const content = t("scCheckMessage", {
    roll,
    target: currentSan,
    result: resultLabel,
    deductExpr: rollResult.display,
    deductVal,
    oldSan: currentSan,
    newSan: finalNewSan,
  });

  const detail = attachProxy(JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
    command: rawCommand,
    check: {
      skillName: "理智值",
      target: currentSan,
      roll,
      success: isSuccess,
      grade: isSuccess ? "success" : "failure",
    },
    sanityCheck: {
      successExpression: successExpr,
      failureExpression: failureExpr,
      deductExpression: rollResult.display,
      deduction: deductVal,
      oldSanity: currentSan,
      newSanity: finalNewSan,
      isSuccess,
    }
  }), ctx?.proxiedBy);

  const vis = visibilityFor(ctx, userIdArg, "channel");
  const msg = await emitCommandMessage(roomId, userIdArg, content, "dice", vis, detail, undefined, {
    skillName: "理智值",
    notation: "1d100",
    resultText: content,
    grade: isSuccess ? "success" : "failure",
  });
  return { success: true, isCommand: true, message: msg };
}

const SAN: StatRef = { kind: "resource", key: "san" };

type SanRoll = {
  kind: "done";
  roll: number;
  isSuccess: boolean;
  rollResult: ReturnType<typeof parseAndRollExpression>;
  oldSan: number;
  loss: number;
  newSan: number;
};
type SanOutcome = SanRoll | { kind: "error"; error: string | undefined } | { kind: "noSheetSan" };

/**
 * Roll the check against `current` and the loss for its outcome. Pure and
 * synchronous, so it can run inside the row-lock step. `newSan` is the
 * unclamped result; a sheet writer replaces it with the value it stored.
 */
function rollSanity(
  current: number,
  successExpr: string,
  failureExpr: string,
  t: (key: string, opts?: Record<string, string | number | Date>) => string,
): SanRoll | { kind: "error"; error: string | undefined } {
  const roll = rollDie(100);
  const isSuccess = roll <= current;
  const rollResult = parseAndRollExpression(isSuccess ? successExpr : failureExpr, t);
  if (!rollResult.success) return { kind: "error", error: rollResult.error };
  const loss = Math.max(0, rollResult.totalSum);
  return { kind: "done", roll, isSuccess, rollResult, oldSan: current, loss, newSan: current - loss };
}

/** A legacy room_skills(理智值) value, for members whose sheet has no sanity. */
async function readLegacySanity(roomId: number, userId: number): Promise<number | null> {
  const [sanSkill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, "理智值")
    )
  );
  return sanSkill ? sanSkill.skillValue : null;
}

/** Keep a legacy room_skills(理智值) row in sync, only if one already exists. */
async function syncLegacySanitySkill(roomId: number, userId: number, value: number) {
  const [existing] = await db.select({ id: roomSkills.id }).from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, "理智值")
    )
  );
  if (!existing) return;
  await db.update(roomSkills)
    .set({ skillValue: value, updatedAt: sqlNow() })
    .where(eq(roomSkills.id, existing.id));
}
