"use server";

import { db, sqlNow } from "@/db";
import { aiProviders, aiTokenUsages } from "@/db/schema";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { encrypt, decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

export interface ProviderData {
  name: string;
  apiEndpoint: string;
  apiKey?: string;       // plain text (new/updated), or undefined to keep existing
  model: string;
  isShared?: boolean;    // admin only
}

// ============================================================
// CRUD
// ============================================================

/** Create a new AI provider (host or admin) */
export async function createProvider(data: ProviderData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);
  const isAdmin = (session.user as any).role === "admin";

  if (!data.name?.trim() || !data.apiEndpoint?.trim() || !data.apiKey?.trim()) {
    const t = await getTranslations("adminProviders");
    throw new Error(t("msgRequireFields"));
  }

  const [provider] = await db.insert(aiProviders).values({
    ownerId: userId,
    name: data.name.trim(),
    apiEndpoint: data.apiEndpoint.trim(),
    apiKeyEncrypted: encrypt(data.apiKey.trim()),
    model: data.model || "gpt-4o",
    isShared: sql`${sql.raw((isAdmin && data.isShared) ? "TRUE" : "FALSE")}`,
    updatedAt: sqlNow(),
  }).returning();

  revalidatePath("/");
  return provider;
}

/** Update an existing provider (owner or admin) */
export async function updateProvider(providerId: number, data: Partial<ProviderData>) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);
  const isAdmin = (session.user as any).role === "admin";

  const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!existing) throw new Error("Provider not found");
  if (existing.ownerId !== userId && !isAdmin) throw new Error("Not authorized");

  const values: any = { updatedAt: sqlNow() };
  if (data.name?.trim()) values.name = data.name.trim();
  if (data.apiEndpoint?.trim()) values.apiEndpoint = data.apiEndpoint.trim();
  if (data.model?.trim()) values.model = data.model.trim();
  if (data.apiKey?.trim() && !data.apiKey.includes("***")) {
    values.apiKeyEncrypted = encrypt(data.apiKey.trim());
  }
  // Admin: always write isShared (checkbox passes true/false)

  if (isAdmin) {
    values.isShared = sql`${sql.raw((data.isShared ?? existing.isShared) ? "TRUE" : "FALSE")}`;
  }

  await db.update(aiProviders).set(values).where(eq(aiProviders.id, providerId));
  revalidatePath("/");
}

/** Delete a provider (owner or admin) */
export async function deleteProvider(providerId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);
  const isAdmin = (session.user as any).role === "admin";

  const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!existing) throw new Error("Provider not found");
  if (existing.ownerId !== userId && !isAdmin) throw new Error("Not authorized");

  await db.delete(aiProviders).where(eq(aiProviders.id, providerId));
  revalidatePath("/");
}

// ============================================================
// Query (with masking)
// ============================================================

/** Get providers available to the current user (own + admin shared) */
export async function getMyProviders() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  const rows = await db
    .select()
    .from(aiProviders)
    .where(
      or(
        eq(aiProviders.ownerId, userId),
        eq(aiProviders.isShared, true),
      )
    )
    .orderBy(aiProviders.name);

  // Mask API keys + add ownership metadata
  return rows.map(p => ({
    ...maskProviderKey(p),
    isOwner: p.ownerId === userId,
  }));

}

/** Get all providers (admin only, for management) */
export async function getAllProviders() {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Admin only");
  }

  const userId = parseInt((session.user as any).id) || 0;

  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.ownerId, userId))
    .orderBy(aiProviders.name);

  return rows.map(maskProviderKey);
}

/** Get a single provider with decrypted key (for AI calls) */
export async function getProviderKey(providerId: number): Promise<string> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);
  const isAdmin = (session.user as any).role === "admin";

  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!provider) throw new Error("Provider not found");

  if (provider.ownerId !== userId && !isAdmin) {
    throw new Error("Unauthorized: Access to this API provider is restricted");
  }

  return decrypt(provider.apiKeyEncrypted);
}

// ============================================================
// Helpers
// ============================================================

function maskProviderKey(p: typeof aiProviders.$inferSelect) {
  return {
    ...p,
    apiKeyEncrypted: "••••••••" + (decrypt(p.apiKeyEncrypted).slice(-4)),
  };
}

/** Get current user's private token usage stats */
export async function getMyPrivateTokenUsages() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  const rows = await db
    .select({
      id: aiTokenUsages.id,
      day: aiTokenUsages.day,
      inputTokens: aiTokenUsages.inputTokens,
      cachedInputTokens: aiTokenUsages.cachedInputTokens,
      outputTokens: aiTokenUsages.outputTokens,
      providerName: aiProviders.name,
      model: aiProviders.model,
    })
    .from(aiTokenUsages)
    .innerJoin(aiProviders, eq(aiTokenUsages.providerId, aiProviders.id))
    .where(
      and(
        eq(aiTokenUsages.userId, userId),
        eq(aiProviders.ownerId, userId),
        eq(aiProviders.isShared, false)
      )
    )
    .orderBy(desc(aiTokenUsages.day), desc(aiTokenUsages.id));

  return rows;
}
