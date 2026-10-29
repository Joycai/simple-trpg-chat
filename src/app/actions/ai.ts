"use server";

import { db, sqlNow } from "@/db";
import { systemConfig, aiProviders } from "@/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { complete } from "@/lib/ai/protocol/client";
import { completeForProvider } from "@/lib/ai/protocol/provider";
import { parseProtocolConfig, resolveConnection } from "@/lib/ai/protocol/config";
import { decrypt } from "@/lib/security/encryption";

/**
 * System Config (Admin Only)
 */

export async function updateSystemConfig(key: string, value: string) {
  await requireAdmin();

  await db.insert(systemConfig).values({
    key,
    value,
  }).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value, updatedAt: sqlNow() },
  });

  if (key === "sensitive_words" || key === "sensitive_words_enabled") {
    const { clearSensitiveWordsCache } = await import("@/lib/security/sensitive-words");
    clearSensitiveWordsCache();
  }

  updateTag("system_config");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

/**
 * Batch-save several system config keys in one round-trip (admin only).
 * Used by the system-config "保存配置" footer.
 */
export async function updateSystemConfigBatch(entries: Record<string, string>) {
  await requireAdmin();

  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  if (rows.length === 0) return;
  // Single multi-row upsert — `excluded.value` pulls each row's incoming value.
  await db.insert(systemConfig).values(rows).onConflictDoUpdate({
    target: systemConfig.key,
    set: { value: sql`excluded.value`, updatedAt: sqlNow() },
  });

  if ("sensitive_words" in entries || "sensitive_words_enabled" in entries) {
    const { clearSensitiveWordsCache } = await import("@/lib/security/sensitive-words");
    clearSensitiveWordsCache();
  }

  updateTag("system_config");
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
    // Old forms have no protocol field. Resolve an owned, unambiguous saved
    // configuration without changing the UI or using another user's credentials.
    const candidates = await db.select().from(aiProviders).where(and(
      eq(aiProviders.ownerId, parseInt(session.user.id)), eq(aiProviders.model, model),
    ));
    const matches = candidates.filter(p => {
      if (p.apiEndpoint.replace(/\/+$/, "") !== endpoint.replace(/\/+$/, "")) return false;
      try { return decrypt(p.apiKeyEncrypted) === apiKey; } catch { return false; }
    });
    if (matches.length > 1 && new Set(matches.map(p => JSON.stringify(p.protocolConfig))).size > 1) return { success: false, error: "Ambiguous protocol configuration" };
    const config = parseProtocolConfig(matches[0]?.protocolConfig);
    // A five-token probe cannot satisfy a saved thinking budget. Test the
    // configured generation limits; keep the small legacy probe otherwise.
    const usesConfiguredBudget = config.reasoning !== undefined || config.maxOutputTokens !== undefined;
    const request = { model, messages: [{ role: "user" as const, content: "ping" }], ...(usesConfiguredBudget ? {} : { maxOutputTokens: 5 }), timeoutMs: 10000 };
    const result = matches[0]
      ? await completeForProvider(matches[0], apiKey, parseInt(session.user.id), request)
      : await complete(resolveConnection(endpoint, apiKey, model), request);
    return result.status === "completed" && !!result.message.content?.trim()
      ? { success: true } : { success: false, error: `AI test did not complete (${result.status})` };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "AI connection failed" };
  }
}
