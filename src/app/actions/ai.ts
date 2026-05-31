"use server";

import { db } from "@/db";
import { systemConfig, hostAiConfig } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { encrypt, decrypt } from "@/lib/encryption";
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
    set: { value, updatedAt: sql`(datetime('now'))` },
  });

  revalidatePath("/admin");
}

/**
 * Host AI Config (GM Only)
 */

export async function getHostAiConfig() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = parseInt((session.user as any).id);
  const [config] = await db.select().from(hostAiConfig).where(eq(hostAiConfig.userId, userId));

  if (!config) return null;

  // Mask the API Key for frontend safety
  const rawKey = decrypt(config.apiKeyEncrypted);
  const maskedKey = rawKey.length > 8 
    ? `${rawKey.slice(0, 3)}***${rawKey.slice(-4)}`
    : "***";

  return {
    apiEndpoint: config.apiEndpoint,
    apiKey: maskedKey,
    model: config.model,
  };
}

export async function updateHostAiConfig(data: { apiEndpoint: string; apiKey?: string; model: string }) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  const userId = parseInt((session.user as any).id);
  
  const values: any = {
    userId,
    apiEndpoint: data.apiEndpoint,
    model: data.model,
    updatedAt: sql`(datetime('now'))`,
  };

  // Only update key if provided (not just masked placeholder)
  if (data.apiKey && !data.apiKey.includes("***")) {
    values.apiKeyEncrypted = encrypt(data.apiKey);
  }

  await db.insert(hostAiConfig).values({
    ...values,
    apiKeyEncrypted: values.apiKeyEncrypted || "", // Ensure non-null if creating new
  }).onConflictDoUpdate({
    target: hostAiConfig.userId,
    set: values,
  });

  revalidatePath("/");
}

/**
 * Connection Test
 */
export async function testAiConnection(endpoint: string, apiKey: string, model: string) {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");

  // If apiKey is masked, we need to decrypt the stored one
  let finalKey = apiKey;
  if (apiKey.includes("***")) {
    const userId = parseInt((session.user as any).id);
    const [config] = await db.select().from(hostAiConfig).where(eq(hostAiConfig.userId, userId));
    if (!config) throw new Error("No stored key to test");
    finalKey = decrypt(config.apiKeyEncrypted);
  }

  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${finalKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${error.slice(0, 100)}` };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
