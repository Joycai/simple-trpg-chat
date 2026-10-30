import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { db } from '@/db';
import { generatedAssets, imageGenerations, rooms, roomMembers, users, systemConfig } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { encrypt } from '@/lib/security/encryption';
import { resolveImageProvider } from '@/lib/ai/image/providers';
import { requestImage, downloadImage, ImageHttpError } from '@/lib/ai/image/transport';
import { settleImageGeneration } from '@/lib/ai/image/generate';
import type { ImageProviderData } from '@/lib/ai/image/config';
import { writeAssetFile } from './storage';
import { ASSET_DAYS, assetUrl, type AssetKind } from './types';
export interface AssetJob {
  purpose: 'user_asset'; sessionId: string; userId: number; roomId: number; kind: AssetKind;
  providerId: number; config: ImageProviderData; key: string; prompt: string;
}
export function serviceQuote(config: ImageProviderData, shared: boolean) {
  return createHash('sha256').update(JSON.stringify({ ...config, apiKey: undefined, isShared: shared })).digest('hex');
}
export async function assetJobAllowed(job: Pick<AssetJob, 'roomId' | 'userId' | 'kind'>) {
  const [user] = await db.select().from(users).where(eq(users.id, job.userId));
  const [room] = await db.select().from(rooms).where(eq(rooms.id, job.roomId));
  const [enabled] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'ai_enabled'));
  if (!user || user.isBot || !room || enabled?.value === 'false') return false;
  const host = user.role === 'admin' || room.hostId === user.id;
  if (job.kind !== 'portrait') return host;
  const [member] = await db.select({ id: roomMembers.id }).from(roomMembers).where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, user.id)));
  return !!member && (!room.frozen || host);
}
export async function executeAssetJob(id: string, job: AssetJob) {
  let rawUsage: unknown = null;
  let count: number | null = null;
  let sent = false;
  try {
    if (!(await assetJobAllowed(job)) || !(await resolveImageProvider(job.providerId, job.userId))) throw new Error('Revoked');
    const signal = AbortSignal.timeout(600_000);
    sent = true;
    const result = await requestImage(job.config, job.prompt, job.key, signal);
    rawUsage = result.rawUsage; count = result.sources.length;
    await db.update(imageGenerations).set({ receiptEncrypted: encrypt(JSON.stringify(result)), rawUsage, imageCount: count, status: 'generated' }).where(eq(imageGenerations.id, id));
    // Contract requests one image; keep a single candidate even if upstream returns extras.
    const bytes = await downloadImage(result.sources[0], signal);
    const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
    if (!['png', 'jpeg', 'webp'].includes((await image.metadata()).format ?? '')) throw new Error('Invalid format');
    const output = await image.rotate().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    if (!(await assetJobAllowed(job))) throw new Error('Revoked');
    const assetId = randomUUID();
    await writeAssetFile(assetId, output);
    await db.insert(generatedAssets).values({ id: assetId, sessionId: job.sessionId, jobId: id,
      ownerId: job.userId, roomId: job.roomId, filename: `${assetId}.webp`, prompt: job.prompt,
      expiresAt: new Date(Date.now() + ASSET_DAYS * 86400000).toISOString() });
    await settleImageGeneration(id, 'succeeded', [assetUrl(assetId)], rawUsage, count);
  } catch (error) {
    // Candidate rows, not messages, are the durable delivery evidence.
    const delivered = await db.select({ id: generatedAssets.id }).from(generatedAssets).where(eq(generatedAssets.jobId, id));
    if (error instanceof ImageHttpError) {
      if (count === null) rawUsage = error.rawUsage;
      await db.update(imageGenerations).set({ rawUsage, upstreamError: { status: error.status, requestId: error.requestId, code: error.providerCode } }).where(eq(imageGenerations.id, id));
    }
    if (delivered.length) await settleImageGeneration(id, 'succeeded', delivered.map(a => assetUrl(a.id)), rawUsage, count);
    else if (!sent || error instanceof ImageHttpError) await settleImageGeneration(id, 'failed', [], rawUsage, count);
    // Unknown paid outcome or interrupted artifact delivery stays pending/generated
    // for explicit reconciliation. Never retry the upstream POST.
    else console.error(`[assetGen] Requires reconciliation: ${id}`);
  }
}
