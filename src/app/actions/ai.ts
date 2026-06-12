"use server";

import { db, sqlNow } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";

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
  revalidatePath("/", "layout");
}

// ============================================================
// Connection Test — still used by provider forms
// ============================================================

export async function testAiConnection(endpoint: string, apiKey: string, model: string) {
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      return { success: false, error: `HTTP ${response.status}: ${error.slice(0, 100)}` };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
