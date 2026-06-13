import { db, sqlNow } from "@/db";
import { roomSkills, rooms, roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendMessageAction } from "@/app/actions/room";
import { rollDie } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

/** Command Execution Result */
export interface CommandResult {
  success: boolean;
  message?: any;
  error?: string;
  isCommand: boolean;
}

export interface TermResult {
  type: "dice" | "constant";
  sign: "+" | "-";
  count: number;
  faces: number;
  keep?: number;
  rolls: number[];
  keptRolls: number[];
  sum: number;
  display: string;
}

/**
 * Command Engine
 * Handles .st, .rc, .rd, .r, .sc, .help
 */
export async function executeCommand(
  roomId: number,
  userId: number,
  content: string
): Promise<CommandResult> {
  const trimmed = content.trim();
  if (!trimmed.startsWith(".") && !trimmed.startsWith("。")) {
    return { success: true, isCommand: false };
  }

  const t = await getTranslations("commands");

  // Regex matches: command prefix + optional spaces + arguments
  const match = trimmed.slice(1).match(/^(help|st|rc|sc|rd|r)\s*(.*)$/i);
  if (!match) {
    return { success: false, isCommand: true, error: t("unknownCommand") };
  }

  const cmd = match[1].toLowerCase();
  let args = match[2] || "";

  // --- .rd / .r (Dice roll expressions) ---
  if (cmd === "rd" || cmd === "r") {
    if (!args.trim()) {
      args = "1d100";
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
      t
    );

    const msg = await sendMessageAction(roomId, rollMsgContent, "dice", diceDetail);
    return { success: true, isCommand: true, message: msg };
  }

  // --- .st (Set Skill) ---
  if (cmd === "st") {
    return await handleSetSkill(roomId, userId, args, t);
  }

  // --- .rc (Roll Check) ---
  if (cmd === "rc") {
    return await handleRollCheck(roomId, userId, args, t);
  }

  // --- .sc (Sanity Check) ---
  if (cmd === "sc") {
    return await handleSanityCheck(roomId, userId, args, t);
  }

  // --- .help ---
  if (cmd === "help") {
    const helpText = t("helpText");
    const msg = await sendMessageAction(roomId, helpText, "system", undefined, true);
    return { success: true, isCommand: true, message: msg };
  }

  return { success: false, isCommand: true, error: t("unknownCommand") };
}

/** Sync sanity value to room_members.character_data under coc7th rules */
export async function syncCharacterSanity(roomId: number, userId: number, newSan: number): Promise<number> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  let finalSan = newSan;

  if (member?.characterData) {
    try {
      const data = JSON.parse(member.characterData);
      if (data && data.ruleTemplate === "coc7th") {
        if (!data.cocDerived) {
          data.cocDerived = {};
        }
        
        // Cap sanity with maximum sanity if set, default to 99
        let sanMax = 99;
        if (typeof data.cocDerived.sanMax === "number") {
          sanMax = data.cocDerived.sanMax;
        } else if (typeof data.cocAttributes?.pow === "number") {
          sanMax = data.cocAttributes.pow;
          data.cocDerived.sanMax = sanMax;
        } else {
          data.cocDerived.sanMax = sanMax;
        }

        finalSan = Math.min(Math.max(0, newSan), sanMax);
        data.cocDerived.san = finalSan;

        await db.update(roomMembers)
          .set({ characterData: JSON.stringify(data) })
          .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
      }
    } catch (e) {
      console.error("Failed to sync character sanity", e);
    }
  }
  return finalSan;
}

/** .st: Set/Update Skills */
async function handleSetSkill(
  roomId: number,
  userId: number,
  args: string,
  t: any
): Promise<CommandResult> {
  // Regex to match "SkillName Value" or "SkillNameValue" (compact)
  const regex = /([^0-9\s\.]+)\s*([0-9]+)/g;
  const updates: { name: string; value: number }[] = [];
  let match;

  while ((match = regex.exec(args)) !== null) {
    let name = match[1].trim();
    const value = parseInt(match[2]);

    // Limit skill name length to prevent DB overflow / UI issues
    if (name.length > 50) {
      name = name.slice(0, 50);
    }

    // Skill value check (usually between 0 and 999)
    if (value < 0 || value > 999) {
      continue;
    }

    const lowerName = name.toLowerCase();
    if (lowerName === "san" || lowerName === "san值") {
      name = "理智值";
    }
    updates.push({ name, value });
  }

  if (updates.length === 0) {
    return { success: false, isCommand: true, error: t("stUsageError") };
  }

  // UPSERT skills
  for (const item of updates) {
    let skillVal = item.value;
    if (item.name === "理智值") {
      // syncCharacterSanity returns the capped sanity value
      skillVal = await syncCharacterSanity(roomId, userId, item.value);
      item.value = skillVal;
    }

    await db.insert(roomSkills).values({
      roomId,
      userId,
      skillName: item.name,
      skillValue: skillVal,
    }).onConflictDoUpdate({
      target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
      set: { skillValue: skillVal, updatedAt: sqlNow() },
    });
  }

  const summary = updates.map(u => `${u.name} ${u.value}`).join(", ");
  const msg = await sendMessageAction(roomId, t("stSuccess", { summary }), "system", undefined, true);

  return { success: true, isCommand: true, message: msg };
}

/** .rc: Roll Check (d100 vs Skill) */
async function handleRollCheck(
  roomId: number,
  userId: number,
  args: string,
  t: any
): Promise<CommandResult> {
  const skillName = args.trim();
  if (!skillName) return { success: false, isCommand: true, error: t("rcUsageError") };

  // 1. Get room rules
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };

  // 2. Get user skill value
  const [skill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, skillName)
    )
  );

  if (!skill) return { success: false, isCommand: true, error: t("rcSkillNotSet", { skillName }) };

  // 3. Roll d100
  const roll = rollDie(100);
  const target = skill.skillValue;
  
  let successLevel = roll <= target ? t("success") : t("failure");
  let icon = roll <= target ? "✅" : "❌";
  let grade: "success" | "failure" | "critical" | "fumble" = roll <= target ? "success" : "failure";

  // 4. Apply COC 7th rules if enabled
  if (room.diceRules === 'coc7th') {
    if (roll <= 5) { successLevel = t("critical"); icon = "🟢"; grade = "critical"; }
    else if (roll >= 96) { successLevel = t("fumble"); icon = "🔴"; grade = "fumble"; }
  }

  const detail = JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
    check: { skillName, target, roll, success: roll <= target, grade }
  });

  const content = t("checkMessage", { skillName, roll, target, successLevel, icon });
  const msg = await sendMessageAction(roomId, content, "dice", detail);

  return { success: true, isCommand: true, message: msg };
}

/** .sc: Sanity Check */
async function handleSanityCheck(
  roomId: number,
  userId: number,
  args: string,
  t: any
): Promise<CommandResult> {
  // 1. Get room rules and verify it's coc7th
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: t("roomNotFound") };
  if (room.ruleTemplate !== "coc7th") {
    return { success: false, isCommand: true, error: t("scNotCoc7th") };
  }

  // 2. Parse arguments: success_deduction/failure_deduction
  // Fixed Regex: Added '-' to allow negative adjustments or subtraction in expressions
  const scMatch = args.trim().match(/^([0-9a-zA-Z+-d\s]+)\s*\/\s*([0-9a-zA-Z+-d\s]+)$/i);
  if (!scMatch) {
    return { success: false, isCommand: true, error: t("scUsageError") };
  }

  const successExpr = scMatch[1].trim();
  const failureExpr = scMatch[2].trim();

  // 3. Get user's current 理智值
  const [sanSkill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, "理智值")
    )
  );

  if (!sanSkill) {
    return { success: false, isCommand: true, error: t("scNoSanity") };
  }

  const currentSan = sanSkill.skillValue;

  // 4. Roll d100 sanity check
  const roll = rollDie(100);
  const isSuccess = roll <= currentSan;
  const resultLabel = isSuccess ? t("success") : t("failure");

  // 5. Roll deduction
  const deductExpr = isSuccess ? successExpr : failureExpr;
  const rollResult = parseAndRollExpression(deductExpr, t);
  if (!rollResult.success) {
    return { success: false, isCommand: true, error: rollResult.error };
  }

  const deductVal = rollResult.totalSum;
  const clampedDeduct = Math.max(0, deductVal);
  
  // Update character sheet sanity and retrieve the actual capped new sanity value
  const finalNewSan = await syncCharacterSanity(roomId, userId, currentSan - clampedDeduct);

  // 6. Update database
  await db.insert(roomSkills).values({
    roomId,
    userId,
    skillName: "理智值",
    skillValue: finalNewSan,
  }).onConflictDoUpdate({
    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
    set: { skillValue: finalNewSan, updatedAt: sqlNow() },
  });

  // 7. Format messages and warnings
  let warning = "";
  if (deductVal >= 5) {
    warning = t("scWarningInsanity");
  }

  const content = t("scCheckMessage", {
    roll,
    target: currentSan,
    result: resultLabel,
    deductExpr: rollResult.display,
    deductVal,
    oldSan: currentSan,
    newSan: finalNewSan,
  }) + warning;

  // Compile detailed information for UI
  const detail = JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
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
      deductExpression: rollResult.display, // Fixed: Storing display representation (e.g. 1d6([4])) instead of raw notation
      deduction: deductVal,
      oldSanity: currentSan,
      newSanity: finalNewSan,
      isSuccess,
    }
  });

  const msg = await sendMessageAction(roomId, content, "dice", detail);
  return { success: true, isCommand: true, message: msg };
}

/** Parse and roll complex dice expressions (e.g. 3d100k2 + 2d20 - 1d6 + 5) */
export function parseAndRollExpression(expr: string, t?: any): {
  success: boolean;
  error?: string;
  terms: TermResult[];
  totalSum: number;
  display: string;
  notation: string;
} {
  const trimmed = expr.replace(/\s+/g, "");
  // Validate characters: only allow digits, d, k, +, -
  if (/[^0-9dkDK+-]/.test(trimmed)) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  // Regex to find terms
  const termRegex = /([+-]?)(?:([0-9]*)d([0-9]+)(?:k([0-9]+))?|([0-9]+))/gi;
  const terms: TermResult[] = [];
  let totalSum = 0;

  let match;
  let lastIndex = 0;

  while ((match = termRegex.exec(trimmed)) !== null) {
    if (match.index !== lastIndex) {
      return {
        success: false,
        error: t ? t("invalidDiceExpression") : "Invalid dice expression",
        terms: [],
        totalSum: 0,
        display: "",
        notation: ""
      };
    }
    lastIndex = termRegex.lastIndex;

    const signStr = match[1];
    const sign: "+" | "-" = signStr === "-" ? "-" : "+";

    if (match[5] !== undefined) {
      // Constant term
      const val = parseInt(match[5]);
      terms.push({
        type: "constant",
        sign,
        count: 0,
        faces: 0,
        rolls: [],
        keptRolls: [],
        sum: val,
        display: val.toString()
      });
      totalSum = sign === "+" ? totalSum + val : totalSum - val;
    } else {
      // Dice term
      const countStr = match[2];
      const count = countStr ? parseInt(countStr) : 1;
      const faces = parseInt(match[3]);
      const keepStr = match[4];
      const keep = keepStr ? parseInt(keepStr) : undefined;

      if (count <= 0 || count > 100) {
        return {
          success: false,
          error: t ? t("diceCountRangeError") : "Dice count must be between 1 and 100",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (faces <= 0 || faces > 1000) {
        return {
          success: false,
          error: t ? t("diceFacesRangeError") : "Dice faces must be between 1 and 1000",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }
      if (keep !== undefined && (keep <= 0 || keep > count)) {
        return {
          success: false,
          error: t ? t("diceKeepRangeError") : "Keep count must be between 1 and total dice count",
          terms: [],
          totalSum: 0,
          display: "",
          notation: ""
        };
      }

      // Roll the dice
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(rollDie(faces));
      }

      let keptRolls = [...rolls];
      if (keep !== undefined) {
        // Sort descending and keep the highest `keep` rolls
        keptRolls.sort((a, b) => b - a);
        keptRolls = keptRolls.slice(0, keep);
      }

      const sum = keptRolls.reduce((a, b) => a + b, 0);
      totalSum = sign === "+" ? totalSum + sum : totalSum - sum;

      const keptLabel = t ? t("keptLabel") || "kept" : "kept";
      let termDisplay = "";
      if (keep !== undefined) {
        termDisplay = `${count}d${faces}k${keep}([${rolls.join(", ")}], ${keptLabel}[${keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${count}d${faces}([${rolls.join(", ")}])`;
      }

      terms.push({
        type: "dice",
        sign,
        count,
        faces,
        keep,
        rolls,
        keptRolls,
        sum,
        display: termDisplay
      });
    }
  }

  if (lastIndex !== trimmed.length || terms.length === 0) {
    return {
      success: false,
      error: t ? t("invalidDiceExpression") : "Invalid dice expression",
      terms: [],
      totalSum: 0,
      display: "",
      notation: ""
    };
  }

  let notation = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notation += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notation += ` ${sign} ${termNotation}`;
    }
  }

  let display = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (i === 0) {
      display += term.sign === "-" ? `-${term.display}` : term.display;
    } else {
      display += ` ${term.sign} ${term.display}`;
    }
  }

  return {
    success: true,
    terms,
    totalSum,
    display,
    notation
  };
}

/** Format complex dice roll details for the message output */
function formatDiceRollMessage(
  notation: string,
  terms: TermResult[],
  totalSum: number,
  t: any
): { content: string; diceDetail: string } {
  // If there's only one term and it's a dice term
  if (terms.length === 1 && terms[0].type === "dice") {
    const term = terms[0];
    const keptLabel = t("keptLabel") || "保留";
    let content = "";
    if (term.keep !== undefined) {
      content = `🎲 ${term.count}d${term.faces}k${term.keep}: [${term.rolls.join(", ")}](${keptLabel}[${term.keptRolls.join(", ")}]) = ${totalSum}`;
    } else {
      content = `🎲 ${term.count}d${term.faces}: [${term.rolls.join(", ")}] = ${totalSum}`;
    }

    const detail = JSON.stringify({
      notation: term.keep !== undefined ? `${term.count}d${term.faces}k${term.keep}` : `${term.count}d${term.faces}`,
      sum: totalSum,
      results: term.rolls,
      keptRolls: term.keptRolls,
    });

    return { content, diceDetail: detail };
  }

  // For compound or constant terms
  let notationStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    const sign = term.sign;
    const termNotation = term.type === "constant"
      ? term.sum.toString()
      : `${term.count}d${term.faces}${term.keep !== undefined ? `k${term.keep}` : ""}`;

    if (i === 0) {
      notationStr += sign === "-" ? `-${termNotation}` : termNotation;
    } else {
      notationStr += ` ${sign} ${termNotation}`;
    }
  }

  let displayStr = "";
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let termDisplay = "";
    if (term.type === "constant") {
      termDisplay = term.sum.toString();
    } else {
      const keptLabel = t("keptLabel") || "保留";
      if (term.keep !== undefined) {
        termDisplay = `${term.count}d${term.faces}k${term.keep}([${term.rolls.join(", ")}]${keptLabel}[${term.keptRolls.join(", ")}])`;
      } else {
        termDisplay = `${term.count}d${term.faces}([${term.rolls.join(", ")}])`;
      }
    }

    if (i === 0) {
      displayStr += term.sign === "-" ? `-${termDisplay}` : termDisplay;
    } else {
      displayStr += ` ${term.sign} ${termDisplay}`;
    }
  }

  const content = `🎲 ${notationStr}: ${displayStr} = ${totalSum}`;

  const detail = JSON.stringify({
    notation: displayStr,
    sum: totalSum,
    results: [],
  });

  return { content, diceDetail: detail };
}
