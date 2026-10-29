import { db, sqlNow } from "@/db";
import { aiTokenUsages, aiProviders, users, aiPointLogs, aiUsageAttempts } from "@/db/schema";
import type { Attempt } from './protocol/client';
export interface UsageReceipt extends Attempt { rates: { input: number; cached: number; output: number }; day: string }
import { sql, eq } from "drizzle-orm";

/**
 * Record token usage for a user and provider on the current day.
 */
export async function recordTokenUsage(
  userId: number,
  providerId: number,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  receipt?: UsageReceipt
) {
  try {
    // Generate YYYY-MM-DD string in UTC timezone to keep consistency with points history query
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, '0');
    const date = String(today.getUTCDate()).padStart(2, '0');
    const dayStr = receipt?.day ?? `${year}-${month}-${date}`;

    await db.transaction(async (tx) => {
      if (receipt) {
        const inserted = await tx.insert(aiUsageAttempts).values({
          attemptId: receipt.attemptId, userId, providerId, model: receipt.model,
          protocol: receipt.protocol, status: receipt.status, usage: receipt.usage,
          rates: receipt.rates, settlement: receipt.usage.status === 'reported' ? 'settled' : receipt.usage.status,
        }).onConflictDoNothing().returning({ id: aiUsageAttempts.attemptId });
        if (!inserted.length) return;
        if (receipt.usage.status === 'missing') return;
        // The receipt is authoritative, including partial evidence. A reported
        // cache bucket is still input even when the upstream omitted its total.
        const usage = receipt.usage;
        inputTokens = usage.inputTotal ?? ((usage.inputUncached ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0));
        cachedInputTokens = Math.min(inputTokens, usage.cacheRead ?? 0);
        outputTokens = usage.outputTotal ?? 0;
      }
      await tx.insert(aiTokenUsages).values({
        userId,
        providerId,
        day: dayStr,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        updatedAt: sqlNow()
      }).onConflictDoUpdate({
        target: [aiTokenUsages.day, aiTokenUsages.userId, aiTokenUsages.providerId],
        set: {
          inputTokens: sql`${aiTokenUsages.inputTokens} + ${inputTokens}`,
          cachedInputTokens: sql`${aiTokenUsages.cachedInputTokens} + ${cachedInputTokens}`,
          outputTokens: sql`${aiTokenUsages.outputTokens} + ${outputTokens}`,
          updatedAt: sqlNow()
        }
      });

      // Billing & Points Deduction for Shared Providers
      const [provider] = await tx.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1);
      if (provider && provider.isShared) {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for('update');
        if (user && user.role !== "admin") {
          const rateInput = Number(receipt?.rates.input ?? provider.tokenRateInput ?? 0);
          const rateCached = Number(receipt?.rates.cached ?? provider.tokenRateCached ?? 0);
          const rateOutput = Number(receipt?.rates.output ?? provider.tokenRateOutput ?? 0);

          const netInputTokens = Math.max(0, inputTokens - cachedInputTokens);
          const inputRate = isNaN(rateInput) ? 0 : rateInput;
          const cachedRate = isNaN(rateCached) ? 0 : rateCached;
          const outputRate = isNaN(rateOutput) ? 0 : rateOutput;

          const points = ((netInputTokens / 1_000_000) * inputRate) + 
                         ((cachedInputTokens / 1_000_000) * cachedRate) + 
                         ((outputTokens / 1_000_000) * outputRate);

          const pointsToDeduct = Number(points.toFixed(6));

          if (pointsToDeduct > 0) {
            const beforePoints = Number(user.aiPoints || 0);
            const afterPoints = Math.max(0, Number((beforePoints - pointsToDeduct).toFixed(6)));
            const deductedPoints = Number((beforePoints - afterPoints).toFixed(6));

            await tx.update(users)
              .set({
                aiPoints: afterPoints
              })
              .where(eq(users.id, userId));

            // Log point deduction
            await tx.insert(aiPointLogs).values({
              userId,
              amount: -deductedPoints,
              beforePoints,
              afterPoints,
              type: "usage",
              description: `${provider.name} (${receipt?.model ?? provider.model})`,
            });

            console.log(`[recordTokenUsage] Billed user ${userId} for shared provider: ${deductedPoints.toFixed(4)} points deducted.`);
          }
        }
      }
    });
  } catch (error) {
    if (receipt) throw error; // caller retries the same idempotency key
    console.error("[recordTokenUsage] Failed to record token usage");
  }
}
