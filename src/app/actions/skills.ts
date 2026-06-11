"use server";

import { db, sqlNow } from "@/db";
import { roomSkills } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";


import { syncCharacterSanity } from "@/lib/commands";

export async function getMySkillsAction(roomId: number) {
  const session = await auth();
  if (!session) return [];
  const userId = parseInt((session.user as any).id);

  return await db.select().from(roomSkills)
    .where(and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId)))
    .orderBy(roomSkills.skillName);
}

export async function upsertSkillAction(roomId: number, skillName: string, skillValue: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt((session.user as any).id);

  let normalizedSkillName = skillName.trim();
  if (normalizedSkillName.toLowerCase() === "san" || normalizedSkillName === "san值") {
    normalizedSkillName = "理智值";
  }

  await db.insert(roomSkills).values({
    roomId,
    userId,
    skillName: normalizedSkillName,
    skillValue,
  }).onConflictDoUpdate({
    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
    set: { skillValue, updatedAt: sqlNow() },
  });

  if (normalizedSkillName === "理智值") {
    await syncCharacterSanity(roomId, userId, skillValue);
  }

  revalidatePath(`/rooms/${roomId}`);
}

export async function deleteSkillAction(roomId: number, skillId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt((session.user as any).id);

  await db.delete(roomSkills).where(
    and(eq(roomSkills.id, skillId), eq(roomSkills.roomId, roomId), eq(roomSkills.userId, userId))
  );

  revalidatePath(`/rooms/${roomId}`);
}
