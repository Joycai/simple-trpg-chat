import 'server-only';
import { db } from '@/db';
import { imageGenerations } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { decrypt } from '@/lib/security/encryption';
import { executeImageJob, settleImageGeneration, type ImageJob } from './generate';

/** Row locking makes claims exclusive across server processes, not just this JS isolate. */
export async function claimImageJob() {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(imageGenerations).where(eq(imageGenerations.status, 'queued'))
      .orderBy(asc(imageGenerations.createdAt)).limit(1).for('update', { skipLocked: true });
    if (!row) return null;
    await tx.update(imageGenerations).set({ status: 'pending', startedAt: new Date().toISOString() }).where(eq(imageGenerations.id, row.id));
    return row;
  });
}

export async function runNextImageJob() {
  const row = await claimImageJob();
  if (!row) return false;
  let job: ImageJob;
  try { job = JSON.parse(decrypt(row.requestEncrypted!)); }
  catch {
    await settleImageGeneration(row.id, 'failed', [], null, null);
    return true;
  }
  // No retries after claim: interruption may have happened after an upstream charge.
  await executeImageJob(row.id, job);
  return true;
}

declare global {
  var __imageWorker: { timer: ReturnType<typeof setInterval>; active: number } | undefined;
}
/** Self-hosted Node worker: durable queue, up to four independent image jobs per process. */
export function startImageWorker() {
  if (globalThis.__imageWorker) return;
  const state = { active: 0, timer: setInterval(tick, 2000) };
  globalThis.__imageWorker = state;
  state.timer.unref();
  function tick() {
    if (state.active >= 4) return;
    state.active++;
    void runNextImageJob().catch(() => console.error('[imageGen] Worker failed; durable attempts retained for reconciliation'))
      .finally(() => { state.active--; });
  }
  tick();
}
