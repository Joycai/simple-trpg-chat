"use server";

import { db } from "@/db";
import { botPresets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/admin/actions";
import { auth } from "@/auth";

export async function getBotPresetsAction() {
  const session = await auth();
  if (!session) return [];
  const role = session.user.role;
  if (role !== "host" && role !== "admin") return [];
  return await db.select().from(botPresets).orderBy(botPresets.name);
}

export async function createBotPresetAction(data: {
  name: string;
  defaultNickname: string;
  systemPrompt: string;
  allowEditPrompt: boolean;
}) {
  await requireAdmin();

  const [newPreset] = await db.insert(botPresets).values({
    name: data.name,
    defaultNickname: data.defaultNickname,
    systemPrompt: data.systemPrompt,
    allowEditPrompt: data.allowEditPrompt,
  }).returning();

  revalidatePath("/admin/ai");
  return newPreset;
}

export async function updateBotPresetAction(
  id: number,
  data: {
    name: string;
    defaultNickname: string;
    systemPrompt: string;
    allowEditPrompt: boolean;
  }
) {
  await requireAdmin();

  const [updatedPreset] = await db.update(botPresets)
    .set({
      name: data.name,
      defaultNickname: data.defaultNickname,
      systemPrompt: data.systemPrompt,
      allowEditPrompt: data.allowEditPrompt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(botPresets.id, id))
    .returning();

  revalidatePath("/admin/ai");
  return updatedPreset;
}

export async function deleteBotPresetAction(id: number) {
  await requireAdmin();

  await db.delete(botPresets).where(eq(botPresets.id, id));
  revalidatePath("/admin/ai");
}
