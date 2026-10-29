"use server";

import { db, sqlNow } from "@/db";
import { aiProviders, aiTokenUsages } from "@/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { encrypt, decrypt } from "@/lib/security/encryption";
import { validateApiEndpoint } from "@/lib/security/url-guard";
import { parseProtocolConfig, resolveConnection } from "@/lib/ai/protocol/config";
import { readJson, requestHttp } from "@/lib/ai/protocol/transport";
import { normalizeVendorId } from "@/lib/ai/provider-presets";
import { buildModelsRequest, parseModelsResponse } from "@/lib/ai/model-fetch";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Done } from "@/lib/actions/result";

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
  protocolConfig?: unknown;
}

// ============================================================
// CRUD
// ============================================================

/** Retired flat-form action: stale clients must refresh into the Vendor/Model editor. */
export async function createProvider(data: ProviderData): Promise<{ error: string } | { id: number }> {
  void data;
  return { error: (await getTranslations('aiCatalog'))('useCatalog') };
}

/** Update an existing provider (owner or admin) */
export async function updateProvider(providerId: number, data: Partial<ProviderData>): Promise<{ error: string } | undefined> {
  const t = await getTranslations("adminProviders");
  const session = await auth();
  if (!session) return { error: t("errorNotAuthenticated") };

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!existing) return { error: t("errorProviderNotFound") };
  if (existing.ownerId !== userId && !isAdmin) return { error: t("errorNotAuthorized") };

  // Linked models must be edited through the Vendor/Model transaction.
  if (existing.vendorId) return { error: (await getTranslations('aiCatalog'))('useCatalog') };

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
    const config = data.protocolConfig === undefined ? existing.protocolConfig : data.protocolConfig;
    if (data.protocolConfig !== undefined) values.protocolConfig = config == null ? null : parseProtocolConfig(config);
    resolveConnection(String(values.apiEndpoint ?? existing.apiEndpoint), "validation-only", String(values.model ?? existing.model), config);
    await db.update(aiProviders).set(values).where(eq(aiProviders.id, providerId));
    revalidatePath("/");
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "Failed to update provider" };
  }
}

/**
 * Delete a provider (owner or admin). Returns `{ success, error }` with a
 * localized error — unlike create/update above, which keep their older
 * `{ error } | data` shape because their callers already consume it.
 */
export async function deleteProvider(providerId: number): Promise<Done> {
  const t = await getTranslations("adminProviders");
  const session = await auth();
  if (!session) return { success: false, error: t("errorNotAuthenticated") };

  const userId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  const [existing] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
  if (!existing) return { success: false, error: t("errorProviderNotFound") };
  if (existing.ownerId !== userId && !isAdmin) return { success: false, error: t("errorNotAuthorized") };

  await db.delete(aiProviders).where(eq(aiProviders.id, providerId));
  revalidatePath("/");
  return { success: true };
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

  let apiKey = input.apiKey?.trim() ?? "";
  let protocolConfig: unknown;
  if (input.providerId) {
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, input.providerId));
    if (!provider) return { error: "Provider not found" };
    if (provider.ownerId !== parseInt(session.user.id) && role !== "admin") return { error: "Not authorized" };
    protocolConfig = provider.protocolConfig;
    if (!apiKey || apiKey.includes("***") || apiKey.includes("••")) {
      try { apiKey = decrypt(provider.apiKeyEncrypted); } catch { return { error: t("msgNeedKeyForFetch") }; }
    }
  }
  if (!apiKey || apiKey.includes("***") || apiKey.includes("••")) return { error: t("msgNeedKeyForFetch") };

  try {
    const { url, headers } = buildModelsRequest(input.vendor, endpoint, apiKey, protocolConfig);
    const signal = AbortSignal.timeout(10000);
    const response = await requestHttp(url, { headers, method: "GET" }, signal);
    const models = parseModelsResponse(await readJson(response, signal));
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
