"use server";

import { db, sqlNow } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

/**
 * System Config (Admin Only)
 */

export async function getSystemConfig(key: string): Promise<string | null> {
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  return config?.value || null;
}

export async function updateSystemConfig(key: string, value: string) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Unauthorized");
  }

  await db.insert(systemConfig).values({
    key,
    value,
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value, updatedAt: sqlNow() },
  });

  revalidatePath("/admin");
}

// ============================================================
// DEPRECATED — host_ai_config replaced by ai_providers (#118-#122)
// Kept for backward compat: testAiConnection is still used
// ============================================================
