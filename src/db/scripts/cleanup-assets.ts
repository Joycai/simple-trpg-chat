/** Expired candidates only; retained assets and unresolved delivery evidence survive. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '@/db';
import { generatedAssets, imageGenerations } from '@/db/schema';
import { and, eq, lt, or } from 'drizzle-orm';
import { ASSET_DIR } from '@/lib/ai/assets/storage';
async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--apply')) throw new Error('Usage: cleanup-assets [--apply]');
  const rows = await db.select({ id: generatedAssets.id }).from(generatedAssets).where(and(eq(generatedAssets.retained, false), or(eq(generatedAssets.hidden, true), lt(generatedAssets.expiresAt, new Date().toISOString()))));
  let removed = 0;
  for (const row of rows) {
    await db.transaction(async tx => {
      const [asset] = await tx.select().from(generatedAssets).where(eq(generatedAssets.id, row.id)).for('update');
      if (!asset || asset.retained || (!asset.hidden && Date.parse(asset.expiresAt) > Date.now())) return;
      const [job] = await tx.select().from(imageGenerations).where(eq(imageGenerations.id, asset.jobId));
      if (!job || !['succeeded', 'partial', 'failed'].includes(job.status)) return;
      if (args.includes('--apply')) {
        await fs.rm(path.join(ASSET_DIR, `${asset.id}.webp`), { force: true });
        await tx.delete(generatedAssets).where(eq(generatedAssets.id, asset.id));
      }
      removed++;
    });
  }
  console.log(JSON.stringify({ candidates: removed, apply: args.includes('--apply') }));
}
main().then(() => process.exit(0)).catch(() => { console.error('Asset cleanup failed'); process.exit(1); });
