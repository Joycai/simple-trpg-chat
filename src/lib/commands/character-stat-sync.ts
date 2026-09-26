import { db } from "@/db";
import { rooms, roomMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { CharacterData } from "@/lib/character/types";
import { getRuleForRoom } from "@/lib/rules";

/**
 * Persist a `.st` attribute or resource write into room_members.character_data
 * by delegating to the active rule module's `applyStatWrite`. The engine no
 * longer knows about COC/d20-specific sheet shapes — each rule handles its
 * own clamping, derivation, and field layout.
 *
 * Returns the value actually stored (rules may clamp resources). When the
 * member has no parsed sheet, returns the input value unchanged.
 */
export async function syncCharacterStat(
  roomId: number,
  userId: number,
  resolution: { kind: "attribute"; key: string } | { kind: "resource"; key: string },
  value: number
): Promise<number> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  if (!member?.characterData) return value;

  let data: CharacterData;
  try {
    data = JSON.parse(member.characterData) as CharacterData;
  } catch (e) {
    console.error("Failed to parse character data", e);
    return value;
  }
  if (!data) return value;

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return value;
  const rule = getRuleForRoom(room);

  const route =
    resolution.kind === "attribute"
      ? ({ kind: "attribute", key: resolution.key, canonical: resolution.key } as const)
      : ({ kind: "resource", key: resolution.key, canonical: resolution.key } as const);

  const { sheet, finalValue } = rule.applyStatWrite(data, route, value);

  await db
    .update(roomMembers)
    .set({ characterData: JSON.stringify(sheet) })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));

  return finalValue;
}

/**
 * Backward-compatible wrapper kept for skills.ts (manual skill form).
 * Syncs the sanity resource and returns the capped value.
 */
export async function syncCharacterSanity(roomId: number, userId: number, newSan: number): Promise<number> {
  return syncCharacterStat(roomId, userId, { kind: "resource", key: "san" }, newSan);
}

/** Read a member's parsed character_data (or null). */
export async function getCharacterData(roomId: number, userId: number): Promise<CharacterData | null> {
  const [member] = await db
    .select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)));
  if (!member?.characterData) return null;
  try {
    return JSON.parse(member.characterData);
  } catch {
    return null;
  }
}
