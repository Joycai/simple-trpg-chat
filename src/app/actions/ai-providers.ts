"use server";

import { db, sqlNow } from "@/db";
import { aiProviders, aiTokenUsages } from "@/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { encrypt, decrypt } from "@/lib/encryption";
import { validateApiEndpoint } from "@/lib/url-guard";
import { normalizeVendorId } from "@/lib/provider-presets";
import { buildModelsRequest, parseModelsResponse } from "@/lib/model-fetch";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

export interface ProviderData {
  name: string;
  apiEndpoint: string;
  apiKey?: string;       // plain text (new/updated), or undefined to keep existing
  vendor?: string;       // AI_VENDORS id; falls back to "openai-compatible"
  model: string;
  isShared?: boolean;    // admin only
  tokenRateInput?: number;
  tokenRateCached?: number;
  tokenRateOutput?: number;
}

// ============================================================
// CRUD
// ============================================================

/** Create a new AI provider (host or admin) */
export async function createProvider(data: ProviderData): Promise<{ error: string } | { id: number }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  if (!data.name?.trim() || !data.apiEndpoint?.trim() || !data.apiKey?.trim()) {
    const t = await getTranslations("adminProviders");
    return { error: t("msgRequireFields") };
  }

  const endpointCheck = await validateApiEndpoint(data.apiEndpoint.trim());
  if (!endpointCheck.valid) return { error: endpointCheck.error! };

  try {
    const [provider] = await db.insert(aiProviders).values({
      ownerId: userId,
      name: data.name.trim(),
      apiEndpoint: data.apiEndpoint.trim(),
      apiKeyEncrypted: encrypt(data.apiKey.trim()),
      apiKeyHint: data.apiKey.trim().slice(-4),
      vendor: normalizeVendorId(data.vendor),
      model: data.model || "gpt-4o",
      isShared: isAdmin && !!data.isShared,
      tokenRateInput: Math.max(0, Number(data.tokenRateInput) || 0.0),
      tokenRateCached: Math.max(0, Number(data.tokenRateCached) || 0.0),
      tokenRateOutput: Math.max(0, Number(data.tokenRateOutput) || 0.0),
      updatedAt: sqlNow(),
    }).returning();

    revalidatePath("/");
    return { id: provider.id };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed to save provider" };
  }
}

/** Update an existing provider (owner or admin) */
export async function updateProvider(providerId: number, data: Partial<ProviderData>): Promise<{ error: string } | undefined> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!existing) return { error: "Provider not found" };
  if (existing.ownerId !== userId && !isAdmin) return { error: "Not authorized" };

  const values: Record<string, unknown> = { updatedAt: sqlNow() };
  if (data.name?.trim()) values.name = data.name.trim();
  if (data.apiEndpoint?.trim()) {
    const endpointCheck = await validateApiEndpoint(data.apiEndpoint.trim());
    if (!endpointCheck.valid) return { error: endpointCheck.error! };
    values.apiEndpoint = data.apiEndpoint.trim();
  }
  if (data.model?.trim()) values.model = data.model.trim();
  if (data.vendor !== undefined) values.vendor = normalizeVendorId(data.vendor);
  if (data.apiKey?.trim() && !data.apiKey.includes("***")) {
    values.apiKeyEncrypted = encrypt(data.apiKey.trim());
    values.apiKeyHint = data.apiKey.trim().slice(-4);
  }
  // Admin: always write isShared (checkbox passes true/false)

  if (isAdmin) {
    values.isShared = data.isShared ?? existing.isShared;
    if (data.tokenRateInput !== undefined) values.tokenRateInput = Math.max(0, Number(data.tokenRateInput) || 0.0);
    if (data.tokenRateCached !== undefined) values.tokenRateCached = Math.max(0, Number(data.tokenRateCached) || 0.0);
    if (data.tokenRateOutput !== undefined) values.tokenRateOutput = Math.max(0, Number(data.tokenRateOutput) || 0.0);
  }

  try {
    await db.update(aiProviders).set(values).where(eq(aiProviders.id, providerId));
    revalidatePath("/");
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed to update provider" };
  }
}

/** Delete a provider (owner or admin) */
export async function deleteProvider(providerId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

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

  const userId = parseInt(session.user.id);

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

/** Get admin's own providers (admin only, for personal management) */
export async function getAllProviders() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    throw new Error("Admin only");
  }

  const userId = parseInt(session.user.id) || 0;

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

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!provider) throw new Error("Provider not found");

  if (provider.ownerId !== userId && !isAdmin) {
    throw new Error("Unauthorized: Access to this API provider is restricted");
  }

  try {
    return decrypt(provider.apiKeyEncrypted);
  } catch {
    throw new Error("Provider API key cannot be decrypted — please delete and re-create this provider.");
  }
}

// ============================================================
// Model listing
// ============================================================

/**
 * Fetch the vendor's model list for the create/edit provider form.
 * Uses the plaintext key typed into the form when present; otherwise falls
 * back to the stored (encrypted) key of `providerId` when editing.
 */
export async function fetchProviderModels(input: {
  vendor: string;
  endpoint: string;
  apiKey?: string;
  providerId?: number | null;
}): Promise<{ models: string[] } | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const role = session.user.role;
  if (role !== "host" && role !== "admin") return { error: "Unauthorized" };

  const t = await getTranslations("adminProviders");
  const endpoint = input.endpoint?.trim().replace(/\/+$/, "");
  if (!endpoint) return { error: t("msgRequireTestFields") };

  const endpointCheck = await validateApiEndpoint(endpoint);
  if (!endpointCheck.valid) return { error: endpointCheck.error! };

  // Masked placeholders ("••••1234" / "***") mean "use the stored key".
  let apiKey = input.apiKey?.trim() ?? "";
  if (!apiKey || apiKey.includes("***") || apiKey.includes("••")) {
    if (!input.providerId) return { error: t("msgNeedKeyForFetch") };
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, input.providerId));
    if (!provider) return { error: "Provider not found" };
    const userId = parseInt(session.user.id);
    if (provider.ownerId !== userId && role !== "admin") return { error: "Not authorized" };
    try {
      apiKey = decrypt(provider.apiKeyEncrypted);
    } catch {
      return { error: t("msgNeedKeyForFetch") };
    }
  }

  const { url, headers } = buildModelsRequest(input.vendor, endpoint, apiKey);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { error: `HTTP ${response.status}: ${body.slice(0, 100)}` };
    }
    const models = parseModelsResponse(await response.json());
    if (models.length === 0) return { error: t("msgFetchFailed") };
    return { models };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : t("msgFetchFailed") };
  }
}

// ============================================================
// Helpers
// ============================================================

function maskProviderKey(p: typeof aiProviders.$inferSelect) {
  let hint = p.apiKeyHint ?? "";
  if (!hint) {
    try { hint = decrypt(p.apiKeyEncrypted).slice(-4); } catch {}
  }
  return {
    ...p,
    apiKeyEncrypted: "••••••••" + hint,
  };
}

/** Get current user's private token usage stats */
export async function getMyPrivateTokenUsages() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);

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
