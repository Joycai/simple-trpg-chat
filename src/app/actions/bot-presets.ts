"use server";

import { db } from "@/db";
import { botPresets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";

type Fail = { success: false; error: string };

/** requireAdmin throws (it is shared); the write actions return a localized
 *  error instead, since Next.js redacts thrown messages in production. */
async function adminGuard(): Promise<Fail | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    const t = await getTranslations("admin");
    return { success: false, error: t("errorNotAdmin") };
  }
}

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
  const denied = await adminGuard();
  if (denied) return denied;

  const [newPreset] = await db.insert(botPresets).values({
    name: data.name,
    defaultNickname: data.defaultNickname,
    systemPrompt: data.systemPrompt,
    allowEditPrompt: data.allowEditPrompt,
  }).returning();

  revalidatePath("/admin/ai");
  return { success: true as const, preset: newPreset };
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
  const denied = await adminGuard();
  if (denied) return denied;

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
  return { success: true as const, preset: updatedPreset };
}

export async function deleteBotPresetAction(id: number) {
  const denied = await adminGuard();
  if (denied) return denied;

  await db.delete(botPresets).where(eq(botPresets.id, id));
  revalidatePath("/admin/ai");
  return { success: true as const };
}
