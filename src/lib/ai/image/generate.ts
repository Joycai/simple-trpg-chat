import 'server-only';
import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { db } from '@/db';
import { users, imageGenerations, aiPointLogs, messages } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { decrypt, encrypt } from '@/lib/security/encryption';
import { ensureChatImageDir } from '@/lib/media/uploads';
import { dispatchMessage } from '@/lib/messaging/router';
import type { AgentToolContext } from '@/lib/ai/agent-tool-handlers';
import { ImagePromptInput } from './config';
import { resolveImageProvider } from './providers';
import { requestImage, downloadImage, ImageHttpError } from './transport';

/** One paid image request per bot turn, including failures with an uncertain upstream outcome. */
export async function generateImageTool(input: unknown, ctx: AgentToolContext) {
  const parsed = ImagePromptInput.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Provide an image prompt (1–8000 characters).' };
  if (ctx.imageGenerationAttempted) return { success: false, error: 'Image generation was already attempted this turn. Do not retry; ask the user to send a new request.' };
  if (!ctx.imageProviderId) return { success: false, error: 'No image service is assigned to this bot.' };
  const provider = await resolveImageProvider(ctx.imageProviderId, ctx.room.hostId);
  if (!provider) return { success: false, error: 'The assigned image service is unavailable to the room host.' };
  const { config, row } = provider;
  const id = randomUUID();
  // Snapshot credentials/settings before reserving funds; no network generation yet.
  const key = decrypt(row.apiKeyEncrypted);
  const reserve = await db.transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, ctx.room.hostId)).for('update');
    if (!user) return false;
    const points = row.isShared && user.role !== 'admin' ? config.ratePerImage : 0;
    if (Number(user.aiPoints) < points) return false;
    await tx.insert(imageGenerations).values({ id, userId: user.id, roomId: ctx.roomId, providerId: row.id,
      snapshot: { name: row.name, model: config.model, protocol: config.protocol, size: config.size, ratePerImage: config.ratePerImage, isShared: row.isShared }, reservedPoints: points });
    if (points > 0) {
      const after = Number((Number(user.aiPoints) - points).toFixed(10));
      await tx.update(users).set({ aiPoints: after }).where(eq(users.id, user.id));
      await tx.insert(aiPointLogs).values({ userId: user.id, amount: -points, beforePoints: user.aiPoints, afterPoints: after, type: 'usage', description: `Image reservation: ${row.name} (${id})` });
    }
    return true;
  });
  if (!reserve) return { success: false, error: 'Insufficient AI points for image generation.' };
  ctx.imageGenerationAttempted = true;
  const urls: string[] = [];
  let rawUsage: unknown = null;
  let generatedCount: number | null = null;
  let delivered = false;
  try {
    const signal = AbortSignal.timeout(600_000);
    const result = await requestImage(config, parsed.data.prompt, key, signal);
    rawUsage = result.rawUsage;
    generatedCount = result.sources.length;
    // Signed URLs and inline bytes are sensitive. Keep an encrypted recovery receipt
    // before doing any download or image processing.
    await db.update(imageGenerations).set({ receiptEncrypted: encrypt(JSON.stringify(result)),
      rawUsage, imageCount: generatedCount, status: 'generated' }).where(eq(imageGenerations.id, id));
    const dir = await ensureChatImageDir();
    for (const source of result.sources) {
      const bytes = await downloadImage(source, signal);
      const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format ?? '')) throw new Error('Unsupported generated image');
      const output = await image.rotate().webp({ quality: 90 }).toBuffer();
      const filename = `${ctx.roomId}-${Date.now()}-${randomBytes(16).toString('hex')}.webp`;
      await fs.writeFile(path.join(dir, filename), output, { flag: 'wx' });
      urls.push(`/api/rooms/${ctx.roomId}/images/${filename}`);
      // Persist each completed artifact before continuing; partial output survives failures.
      await db.update(imageGenerations).set({ images: urls, rawUsage, imageCount: generatedCount, status: 'generated' }).where(eq(imageGenerations.id, id));
      await dispatchMessage({ roomId: ctx.roomId, actorUserId: ctx.botUserId, nickname: ctx.botNickname, type: 'image',
        audience: ctx.replyIsPrivate ? 'dm' : 'everyone', targetUserId: ctx.replyIsPrivate ? ctx.targetUserId : null, content: urls[urls.length - 1] });
      delivered = true;
    }
    await settleImageGeneration(id, 'succeeded', urls, rawUsage, generatedCount);
    return { success: true, images: urls, message: 'Images have already been sent to the current conversation. Do not call send_image or generate again.' };
  } catch (error) {
    // Refund undelivered requests under the site's delivery-based points policy;
    // this makes no claim that an upstream timeout was free.
    try {
      if (error instanceof ImageHttpError) {
        // Artifact CDN failures must not overwrite the generation receipt usage.
        if (generatedCount === null) rawUsage = error.rawUsage;
        await db.update(imageGenerations).set({ rawUsage, upstreamError: {
          status: error.status, requestId: error.requestId, code: error.providerCode,
        } }).where(eq(imageGenerations.id, id));
      }
      // dispatchMessage may commit before its SSE broadcast throws. If the
      // durable read fails, leave the attempt open for reconciliation, never refund.
      if (!delivered && urls.length) {
        const rows = await db.select({ id: messages.id }).from(messages).where(and(
          eq(messages.roomId, ctx.roomId), eq(messages.userId, ctx.botUserId),
          eq(messages.type, 'image'), inArray(messages.content, urls)));
        delivered = rows.length > 0;
      }
      await settleImageGeneration(id, delivered ? 'partial' : 'failed', urls, rawUsage, generatedCount);
    }
    catch { console.error(`[imageGen] Settlement requires reconciliation: ${id}`); }
    return { success: delivered, images: urls, error: 'Image generation or delivery did not fully complete. Do not retry automatically.', attemptId: id };
  }
}

export async function settleImageGeneration(id: string, status: 'succeeded' | 'partial' | 'failed', images: string[], rawUsage: unknown, imageCount: number | null) {
  await db.transaction(async tx => {
    const [attempt] = await tx.select().from(imageGenerations).where(eq(imageGenerations.id, id)).for('update');
    if (!attempt || ['succeeded', 'partial', 'failed'].includes(attempt.status)) return;
    let points = attempt.reservedPoints;
    if (status === 'failed' && points > 0) {
      const [user] = await tx.select().from(users).where(eq(users.id, attempt.userId)).for('update');
      const after = Number((Number(user.aiPoints) + points).toFixed(10));
      await tx.update(users).set({ aiPoints: after }).where(eq(users.id, user.id));
      await tx.insert(aiPointLogs).values({ userId: user.id, amount: points, beforePoints: user.aiPoints, afterPoints: after, type: 'usage', description: `Image delivery refund (${id})` });
      points = 0;
    }
    // n=1 is explicit. Unexpected extra provider outputs are delivered at no extra site charge.
    await tx.update(imageGenerations).set({ status, images, rawUsage, imageCount, reservedPoints: points }).where(eq(imageGenerations.id, id));
  });
}
