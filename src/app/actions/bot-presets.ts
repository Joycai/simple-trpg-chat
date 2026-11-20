"use server";

import { z } from "zod";
import { db } from "@/db";
import { botPresets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import type { Fail } from "@/lib/actions/result";

const botPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultNickname: z.string().trim().min(1).max(60),
  systemPrompt: z.string().trim().min(1).max(20000),
  allowEditPrompt: z.boolean(),
});

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

  const t = await getTranslations("admin");
  const parsed = botPresetSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false as const, error: t("errorMissingFields") };
  }

  try {
    const [newPreset] = await db.insert(botPresets).values(parsed.data).returning();
    revalidatePath("/admin/ai");
    return { success: true as const, preset: newPreset };
  } catch {
    return { success: false as const, error: t("operationFailed") };
  }
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

  const t = await getTranslations("admin");
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { success: false as const, error: t("presetNotFound") };
  }
  const parsed = botPresetSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false as const, error: t("errorMissingFields") };
  }

  try {
    const [updatedPreset] = await db.update(botPresets)
      .set({
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(botPresets.id, id))
      .returning();

    if (!updatedPreset) {
      return { success: false as const, error: t("presetNotFound") };
    }

    revalidatePath("/admin/ai");
    return { success: true as const, preset: updatedPreset };
  } catch {
    return { success: false as const, error: t("operationFailed") };
  }
}

export async function deleteBotPresetAction(id: number) {
  const denied = await adminGuard();
  if (denied) return denied;

  const t = await getTranslations("admin");
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { success: false as const, error: t("presetNotFound") };
  }

  try {
    const deleted = await db.delete(botPresets).where(eq(botPresets.id, id)).returning({ id: botPresets.id });
    if (!deleted.length) {
      return { success: false as const, error: t("presetNotFound") };
    }
    revalidatePath("/admin/ai");
    return { success: true as const };
  } catch {
    return { success: false as const, error: t("operationFailed") };
  }
}
