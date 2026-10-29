'use server';

import { auth } from '@/auth';
import { db, sqlNow } from '@/db';
import { aiVendors, aiProviders } from '@/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { validateApiEndpoint } from '@/lib/security/url-guard';
import { vendorSchema, modelSchema, routeSchema, modelConnection, validateVendorRoute } from '@/lib/ai/vendor-config';
import { parseProtocolConfig } from '@/lib/ai/protocol/config';
import { completeForProvider } from '@/lib/ai/protocol/provider';
import { buildModelsRequest, parseModelsResponse } from '@/lib/ai/model-fetch';
import { requestHttp, readJson } from '@/lib/ai/protocol/transport';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { Done } from '@/lib/actions/result';

async function identity() {
  const session = await auth();
  if (!session || !['host', 'admin'].includes(session.user.role)) throw new Error('forbidden');
  return { userId: Number(session.user.id), admin: session.user.role === 'admin' };
}
async function failure(error: unknown) {
  const t = await getTranslations('aiCatalog');
  const known = ['forbidden', 'routeInUse', 'vendorNotEmpty', 'keyRequired', 'invalidEndpoint'];
  const key = error instanceof Error && known.includes(error.message) ? error.message : 'invalid';
  return { success: false as const, error: t(key) };
}
function routes(value: unknown) { return routeSchema.array().parse(value); }

export async function getAiCatalog() {
  const { userId, admin } = await identity();
  const vendors = await db.select({ id: aiVendors.id, name: aiVendors.name, platform: aiVendors.platform,
    routes: aiVendors.routes, keyHint: aiVendors.apiKeyHint }).from(aiVendors).where(eq(aiVendors.ownerId, userId));
  const models = await db.select({ id: aiProviders.id, vendorId: aiProviders.vendorId, name: aiProviders.name,
    model: aiProviders.model, ownerId: aiProviders.ownerId, isShared: aiProviders.isShared,
    protocolConfig: aiProviders.protocolConfig, protocolSettings: aiProviders.protocolSettings,
    tokenRateInput: aiProviders.tokenRateInput, tokenRateCached: aiProviders.tokenRateCached, tokenRateOutput: aiProviders.tokenRateOutput,
  }).from(aiProviders).where(or(eq(aiProviders.ownerId, userId), eq(aiProviders.isShared, true)));
  return { admin, vendors: vendors.map(v => ({ ...v, routes: routes(v.routes) })), models: models.map(m => ({ ...m, isOwner: m.ownerId === userId })) };
}

export async function saveAiVendor(id: number | null, input: unknown): Promise<Done> {
  try {
    const { userId } = await identity();
    const data = vendorSchema.parse(input);
    for (const route of data.routes) {
      validateVendorRoute(route);
      if (!(await validateApiEndpoint(route.endpoint)).valid) throw new Error('invalidEndpoint');
    }
    await db.transaction(async tx => {
      const existing = id === null ? undefined : (await tx.select().from(aiVendors).where(and(eq(aiVendors.id, id), eq(aiVendors.ownerId, userId))).for('update'))[0];
      if (id !== null && !existing) throw new Error('forbidden');
      const key = data.apiKey?.trim();
      if (!existing && !key && data.routes.some(r => r.auth !== 'none')) throw new Error('keyRequired');
      const apiKeyEncrypted = key ? encrypt(key) : existing?.apiKeyEncrypted ?? encrypt('');
      const apiKeyHint = key ? key.slice(-4) : existing?.apiKeyHint ?? '';
      if (data.routes.some(r => r.auth !== 'none') && !decrypt(apiKeyEncrypted).trim()) throw new Error('keyRequired');
      const values = { ownerId: userId, name: data.name, platform: data.platform, routes: data.routes, apiKeyEncrypted, apiKeyHint };
      if (!existing) { await tx.insert(aiVendors).values(values); return; }
      const models = await tx.select().from(aiProviders).where(eq(aiProviders.vendorId, existing.id));
      for (const model of models) {
        const config = parseProtocolConfig(model.protocolConfig);
        const connection = modelConnection(data.routes, { ...model, protocol: config.protocol, settings: { [config.protocol]: config } });
        await tx.update(aiProviders).set({ ...connection, vendor: data.platform, apiKeyEncrypted, apiKeyHint, updatedAt: sqlNow() }).where(eq(aiProviders.id, model.id));
      }
      await tx.update(aiVendors).set(values).where(eq(aiVendors.id, existing.id));
    });
    revalidatePath('/'); return { success: true };
  } catch (e) { return failure(e); }
}

export async function saveAiModel(vendorId: number, id: number | null, input: unknown): Promise<Done> {
  try {
    const { userId, admin } = await identity();
    const data = modelSchema.parse(input);
    if (!admin && (data.isShared || data.tokenRateInput || data.tokenRateCached || data.tokenRateOutput)) throw new Error('forbidden');
    await db.transaction(async tx => {
      // Vendor lock serializes route/key edits, model saves and vendor deletion.
      const [vendor] = await tx.select().from(aiVendors).where(and(eq(aiVendors.id, vendorId), eq(aiVendors.ownerId, userId))).for('update');
      if (!vendor) throw new Error('forbidden');
      let existing: typeof aiProviders.$inferSelect | undefined;
      if (id !== null) {
        [existing] = await tx.select().from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.vendorId, vendorId), eq(aiProviders.ownerId, userId)));
        if (!existing) throw new Error('forbidden');
      }
      const connection = modelConnection(routes(vendor.routes), data);
      const values = { ...connection, ownerId: userId, vendorId, vendor: vendor.platform, name: data.name, model: data.model,
        apiKeyEncrypted: vendor.apiKeyEncrypted, apiKeyHint: vendor.apiKeyHint,
        protocolSettings: { ...data.settings, [data.protocol]: connection.protocolConfig },
        isShared: admin ? data.isShared : existing?.isShared ?? false,
        tokenRateInput: admin ? data.tokenRateInput : existing?.tokenRateInput ?? 0,
        tokenRateCached: admin ? data.tokenRateCached : existing?.tokenRateCached ?? 0,
        tokenRateOutput: admin ? data.tokenRateOutput : existing?.tokenRateOutput ?? 0,
        updatedAt: sqlNow() };
      if (id === null) await tx.insert(aiProviders).values(values);
      else await tx.update(aiProviders).set(values).where(eq(aiProviders.id, id));
    });
    revalidatePath('/'); return { success: true };
  } catch (e) { return failure(e); }
}

export async function deleteAiVendor(id: number): Promise<Done> {
  try {
    const { userId } = await identity();
    await db.transaction(async tx => {
      const [vendor] = await tx.select().from(aiVendors).where(and(eq(aiVendors.id, id), eq(aiVendors.ownerId, userId))).for('update');
      if (!vendor) throw new Error('forbidden');
      if ((await tx.select({ id: aiProviders.id }).from(aiProviders).where(eq(aiProviders.vendorId, id)).limit(1)).length) throw new Error('vendorNotEmpty');
      await tx.delete(aiVendors).where(eq(aiVendors.id, id));
    });
    revalidatePath('/'); return { success: true };
  } catch (e) { return failure(e); }
}

/** Probe a saved model by ID; do not infer protocol or credentials from user text. */
export async function testAiModel(id: number): Promise<Done> {
  try {
    const { userId } = await identity();
    const [model] = await db.select().from(aiProviders).where(and(eq(aiProviders.id, id), eq(aiProviders.ownerId, userId)));
    if (!model) throw new Error('forbidden');
    const config = parseProtocolConfig(model.protocolConfig);
    const result = await completeForProvider(model, decrypt(model.apiKeyEncrypted), userId, {
      model: model.model, messages: [{ role: 'user', content: 'ping' }], timeoutMs: 10000,
      ...(!config.reasoning && !config.maxOutputTokens ? { maxOutputTokens: 5 } : {}),
    });
    if (result.status !== 'completed' || !result.message.content?.trim()) throw new Error('invalid');
    return { success: true };
  } catch (e) { return failure(e); }
}

export async function fetchVendorModels(vendorId: number, protocol: string): Promise<{ models: string[] } | { error: string }> {
  try {
    const { userId } = await identity();
    const [vendor] = await db.select().from(aiVendors).where(and(eq(aiVendors.id, vendorId), eq(aiVendors.ownerId, userId)));
    if (!vendor) throw new Error('forbidden');
    const route = routes(vendor.routes).find(r => r.protocol === protocol);
    if (!route) throw new Error('invalid');
    const probe = validateVendorRoute(route);
    const { url, headers } = buildModelsRequest(vendor.platform, route.endpoint, decrypt(vendor.apiKeyEncrypted), { ...probe.config, model: probe.model });
    const signal = AbortSignal.timeout(10000);
    const models = parseModelsResponse(await readJson(await requestHttp(url, { method: 'GET', headers }, signal), signal));
    if (!models.length) return { error: (await getTranslations('aiCatalog'))('fetchFailed') };
    return { models };
  } catch (e) { return { error: (await failure(e)).error }; }
}
