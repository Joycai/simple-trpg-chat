"use server";

import { db, sqlNow } from "@/db";
import { roomSkills } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { resolveSheetWriter } from "@/lib/auth/sheet-access";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import { listMySkills } from "@/lib/room/initial-snapshot";
import type { Done, Fail } from "@/lib/actions/result";

import { syncCharacterSanity } from "@/lib/commands/engine";

/** Skill names are capped like `.st` names. */
const SKILL_NAME_MAX = 50;

async function fail(key: string): Promise<Fail> {
  return { success: false, error: (await getTranslations("character"))(key) };
}

/** Any member may read another member's skills (character panel viewing). */
export async function getRoomSkills(roomId: number, userId: number) {
  await checkRoomAccess(roomId, false);
  return await db
    .select()
    .from(roomSkills)
    .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)))
    .orderBy(roomSkills.skillName);
}

export async function getMySkillsAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  return listMySkills(roomId, userId);
}

/**
 * Set a skill on a member's card — the caller's own, or (host / admin) any
 * member's, under the same rule as every sheet write (`resolveSheetWriter`).
 */
export async function upsertSkillAction(
  roomId: number,
  skillName: string,
  skillValue: number,
  targetUserId?: number,
): Promise<Done> {
  const session = await auth();
  if (!session) return fail("errorNotAuthenticated");
  const userId = targetUserId ?? parseInt(session.user.id);
  const w = await resolveSheetWriter(roomId, userId);
  if (!w.ok) return fail(w.key);

  let normalizedSkillName = skillName.trim().slice(0, SKILL_NAME_MAX);
  if (!normalizedSkillName) return fail("errorInvalidEdit");
  if (normalizedSkillName.toLowerCase() === "san" || normalizedSkillName === "san值") {
    normalizedSkillName = "理智值";
  }
  const value = Math.round(Number(skillValue));
  if (!Number.isFinite(value) || value < 0 || value > 999) return fail("errorInvalidEdit");

  await db.insert(roomSkills).values({
    roomId,
    userId,
    skillName: normalizedSkillName,
    skillValue: value,
  }).onConflictDoUpdate({
    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
    set: { skillValue: value, updatedAt: sqlNow() },
  });

  if (normalizedSkillName === "理智值") {
    await syncCharacterSanity(roomId, userId, value);
  }

  await broadcastCharacterUpdate(roomId, userId, { by: w.callerId });
  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}

/** Remove one of a member's skills (own, or host / admin for any member). */
export async function deleteSkillAction(roomId: number, skillId: number, targetUserId?: number): Promise<Done> {
  const session = await auth();
  if (!session) return fail("errorNotAuthenticated");
  const userId = targetUserId ?? parseInt(session.user.id);
  const w = await resolveSheetWriter(roomId, userId);
  if (!w.ok) return fail(w.key);

  // Scoped to the room and the target, so a skill id from another member or
  // room can't be deleted through this call.
  await db.delete(roomSkills).where(
    and(eq(roomSkills.id, skillId), eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId))
  );

  await broadcastCharacterUpdate(roomId, userId, { by: w.callerId });
  revalidatePath(`/rooms/${roomId}`);
  return { success: true };
}
