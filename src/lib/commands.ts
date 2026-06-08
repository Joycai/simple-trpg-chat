import { db, sqlNow } from "@/db";
import { roomSkills, rooms, roomMembers, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { rollDiceAction, sendMessageAction } from "@/app/actions/room";
import { rollDie } from "@/lib/utils";

/** Command Execution Result */
export interface CommandResult {
  success: boolean;
  message?: any;
  error?: string;
  isCommand: boolean;
}

/**
 * Command Engine
 * Handles .st, .rc, .rd<N>
 */
export async function executeCommand(
  roomId: number,
  userId: number,
  content: string
): Promise<CommandResult> {
  const trimmed = content.trim();
  if (!trimmed.startsWith(".")) {
    return { success: true, isCommand: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(" ");

  // --- .rd<N> (Fast roll) ---
  if (cmd.startsWith("rd")) {
    const faces = parseInt(cmd.slice(2));
    if (!isNaN(faces)) {
      const count = parseInt(parts[1]) || 1;
      const msg = await rollDiceAction(roomId, faces, count);
      return { success: true, isCommand: true, message: msg };
    }
  }

  // --- .st (Set Skill) ---
  if (cmd === "st") {
    return await handleSetSkill(roomId, userId, args);
  }

  // --- .rc (Roll Check) ---
  if (cmd === "rc") {
    return await handleRollCheck(roomId, userId, args);
  }

  // --- .help ---
  if (cmd === "help") {
    const helpText = `📖 **指令帮助**
.st 技能名 数值 — 设置技能（支持批量：.st 侦查50聆听60）
.rc 技能名 — 技能检定（d100 vs 设定值）
.rd<N> — 投骰（如 .rd100 .rd20 .rd10）
.help — 显示此帮助`;
    const msg = await sendMessageAction(roomId, helpText, "system", undefined, true);
    return { success: true, isCommand: true, message: msg };
  }

  return { success: false, isCommand: true, error: "Unknown command. Type .help for available commands." };
}

/** .st: Set/Update Skills */
async function handleSetSkill(roomId: number, userId: number, args: string): Promise<CommandResult> {
  // Regex to match "SkillName Value" or "SkillNameValue" (compact)
  const regex = /([^0-9\s\.]+)\s*([0-9]+)/g;
  const updates: { name: string; value: number }[] = [];
  let match;

  while ((match = regex.exec(args)) !== null) {
    updates.push({ name: match[1], value: parseInt(match[2]) });
  }

  if (updates.length === 0) {
    return { success: false, isCommand: true, error: "格式错误。正确用法：.st 侦查 50" };
  }

  // UPSERT skills
  for (const item of updates) {
    await db.insert(roomSkills).values({
      roomId,
      userId,
      skillName: item.name,
      skillValue: item.value,
    }).onConflictDoUpdate({
      target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
      set: { skillValue: item.value, updatedAt: sqlNow() },
    });
  }

  const summary = updates.map(u => `${u.name} ${u.value}`).join(", ");
  const msg = await sendMessageAction(roomId, `📋 技能已更新：${summary}`, "system", undefined, true);

  return { success: true, isCommand: true, message: msg };
}

/** .rc: Roll Check (d100 vs Skill) */
async function handleRollCheck(roomId: number, userId: number, args: string): Promise<CommandResult> {
  const skillName = args.trim();
  if (!skillName) return { success: false, isCommand: true, error: "用法：.rc 侦查" };

  // 1. Get room rules
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, isCommand: true, error: "Room not found" };

  // 2. Get user skill value
  const [skill] = await db.select().from(roomSkills).where(
    and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, userId),
      eq(roomSkills.skillName, skillName)
    )
  );

  if (!skill) return { success: false, isCommand: true, error: `技能 '${skillName}' 未设置。请先使用 .st 设置。` };

  // 3. Roll d100
  const roll = rollDie(100);
  const target = skill.skillValue;
  
  let successLevel = roll <= target ? "成功" : "失败";
  let icon = roll <= target ? "✅" : "❌";
  let grade: "success" | "failure" | "critical" | "fumble" = roll <= target ? "success" : "failure";

  // 4. Apply COC 7th rules if enabled
  if (room.diceRules === 'coc7th') {
    if (roll <= 5) { successLevel = "大成功！"; icon = "🟢"; grade = "critical"; }
    else if (roll >= 96) { successLevel = "大失败！"; icon = "🔴"; grade = "fumble"; }
  }

  const detail = JSON.stringify({
    dice: "d100",
    count: 1,
    results: [roll],
    sum: roll,
    notation: "1d100",
    check: { skillName, target, roll, success: roll <= target, grade }
  });

  const content = `🎲 ${skillName}检定：d100=${roll} / ${target} → ${successLevel} ${icon}`;
  const msg = await sendMessageAction(roomId, content, "dice", detail);

  return { success: true, isCommand: true, message: msg };
}
