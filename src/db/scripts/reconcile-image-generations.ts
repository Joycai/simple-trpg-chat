/** Reconcile interrupted image attempts against persisted chat delivery. Dry run by default. */
import { db } from '@/db';
import { imageGenerations, messages } from '@/db/schema';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { settleImageGeneration } from '@/lib/ai/image/generate';
async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('Usage: reconcile-image-generations [--apply]');
  const apply = args.includes('--apply');
  // Exceeds the ten-minute generation deadline. Never race an active request.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const rows = await db.select().from(imageGenerations).where(and(inArray(imageGenerations.status, ['pending', 'generated']), lt(sql`coalesce(${imageGenerations.startedAt}, ${imageGenerations.createdAt})`, cutoff)));
  for (const row of rows) {
    const urls = Array.isArray(row.images) ? row.images.filter((v): v is string => typeof v === 'string') : [];
    const delivered = row.roomId && urls.length ? await db.select({ content: messages.content }).from(messages).where(and(eq(messages.roomId, row.roomId), eq(messages.type, 'image'), inArray(messages.content, urls))) : [];
    const status = delivered.length ? 'partial' : 'failed';
    console.log(JSON.stringify({ id: row.id, status, delivered: delivered.length, refund: delivered.length ? 0 : row.reservedPoints, apply }));
    if (apply) await settleImageGeneration(row.id, status, urls, row.rawUsage, row.imageCount);
  }
  console.log(`${rows.length} interrupted image attempts found.`);
}
main().then(() => process.exit(0)).catch(() => { console.error('Image reconciliation failed; no credentials or prompts have been printed.'); process.exit(1); });
