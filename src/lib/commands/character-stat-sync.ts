import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { CharacterData } from "@/lib/character/types";
import { applySheetEdit, statEdit, statValue, type StatRef } from "@/lib/character/sheet-model";
import { parseSheetOrNull, serializeSheet } from "@/lib/character/sheet-store";
import { getRule } from "@/lib/rules";

/**
 * Persist a single attribute or resource write (`.sc`'s SAN loss, the skills
 * form's 理智值 row) into room_members.character_data through the generic
 * `applySheetEdit`, which owns clamping and derivation for every rule.
 *
 * Returns the value actually stored (resources clamp to their max). When the
 * member has no usable sheet, returns the input value unchanged.
 */
export async function syncCharacterStat(
  roomId: number,
  userId: number,
  ref: StatRef,
  value: number
): Promise<number> {
  const sheet = await getCharacterData(roomId, userId);
  if (!sheet) return value;

  const rule = getRule(sheet.ruleTemplate);
  const next = applySheetEdit(rule, sheet, statEdit(ref, value)).sheet;
  const json = serializeSheet(next);
  if (json) {
    await db
      .update(roomMembers)
      .set({ characterData: json })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  }
  return statValue(rule, next, ref) ?? value;
}

/**
 * Backward-compatible wrapper kept for skills.ts (manual skill form).
 * Syncs the sanity resource and returns the capped value.
 */
export async function syncCharacterSanity(roomId: number, userId: number, newSan: number): Promise<number> {
  return syncCharacterStat(roomId, userId, { kind: "resource", key: "san" }, newSan);
}

/** Read a member's sheet (v2, upgraded on read), or null when there is none. */
export async function getCharacterData(roomId: number, userId: number): Promise<CharacterData | null> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  if (!member) return null;
  // The room rule settles pre-v2 rows that carry two rules' bags.
  const [room] = await db.select({ ruleTemplate: rooms.ruleTemplate }).from(rooms).where(eq(rooms.id, roomId));
  return parseSheetOrNull(member.characterData, room?.ruleTemplate ?? undefined);
}
