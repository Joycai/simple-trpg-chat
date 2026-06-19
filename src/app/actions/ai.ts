"use server";

import { db, sqlNow } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/app/admin/actions";

/**
 * System Config (Admin Only)
 */

export async function getSystemConfig(key: string): Promise<string | null> {
  await requireAdmin();
  const [config] = await db.select().from(systemConfig).where(eq(systemConfig.key, key));
  return config?.value || null;
}

export async function updateSystemConfig(key: string, value: string) {
  await requireAdmin();

  await db.insert(systemConfig).values({
    key,
    value,
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value, updatedAt: sqlNow() },
  });

  if (key === "sensitive_words") {
    const { clearSensitiveWordsCache } = await import("@/lib/sensitive-words");
    clearSensitiveWordsCache();
  }

  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

// ============================================================
// Connection Test — still used by provider forms
// ============================================================

export async function testAiConnection(endpoint: string, apiKey: string, model: string) {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };
  const role = session.user.role;
  if (role !== "host" && role !== "admin") return { success: false, error: "Unauthorized" };
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
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
