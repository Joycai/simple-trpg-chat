import { db, sqlNow } from "@/db";
import { roomSkills, rooms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { rollDie } from "@/lib/commands/dice";
import { parseAndRollExpression } from "@/lib/commands/expression";
import { getRuleForRoom } from "@/lib/rules";
import type { CommandResult, CommandContext } from "./command-types";
import { attachProxy, visibilityFor, emitCommandMessage } from "./command-message";
import { syncCharacterStat, getCharacterData } from "./character-stat-sync";

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

  // Current sanity: character sheet (current) → legacy room_skills(理智值).
  const currentSan = await readCurrentSanity(roomId, userIdArg);
  if (currentSan === null) {
    return { success: false, isCommand: true, error: t("scNoSanity"), code: "STAT_NOT_SET" };
  }

  const roll = rollDie(100);
  const isSuccess = roll <= currentSan;
  const resultLabel = isSuccess ? t("success") : t("failure");

  const deductExpr = isSuccess ? successExpr : failureExpr;
  const rollResult = parseAndRollExpression(deductExpr, t);
  if (!rollResult.success) {
    return { success: false, isCommand: true, error: rollResult.error };
  }

  const deductVal = rollResult.totalSum;
  const clampedDeduct = Math.max(0, deductVal);

  // Write the new sanity to the character sheet (current value) and keep any
  // legacy room_skills(理智值) row in sync for backward compatibility.
  const finalNewSan = await syncCharacterStat(roomId, userIdArg, { kind: "resource", key: "san" }, currentSan - clampedDeduct);
  await syncLegacySanitySkill(roomId, userIdArg, finalNewSan);

  // The insanity warning is now rendered client-side as a separate banner
  // attached to the sanity card (see ChatMessage.tsx). The `deduction >= 5`
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

/** Read the current sanity value: character sheet current → base → legacy room_skills. */
async function readCurrentSanity(roomId: number, userId: number): Promise<number | null> {
  const data = await getCharacterData(roomId, userId);
  if (data) {
    // Sanity is a rule capability, not a COC hardcode: any rule that declares
    // `hasSanity` exposes it through readStatus().resources.san.
    const rule = getRuleForRoom(data);
    if (rule.capabilities.hasSanity) {
      const cur = rule.readStatus(data).resources.san?.current;
      if (typeof cur === "number") return cur;
    }
  }
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
