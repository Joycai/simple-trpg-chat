import { db, sqlNow } from "@/db";
import { aiTokenUsages, aiProviders, users, aiPointLogs } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

/**
 * Record token usage for a user and provider on the current day.
 */
export async function recordTokenUsage(
  userId: number,
  providerId: number,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
) {
  try {
    // Generate YYYY-MM-DD string in local timezone
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const date = String(today.getDate()).padStart(2, '0');
    const dayStr = `${year}-${month}-${date}`;

    await db.transaction(async (tx) => {
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
          const rateInput = Number(provider.tokenRateInput || 0);
          const rateCached = Number(provider.tokenRateCached || 0);
          const rateOutput = Number(provider.tokenRateOutput || 0);

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

            await tx.update(users)
              .set({
                aiPoints: afterPoints
              })
              .where(eq(users.id, userId));

            // Log point deduction
            await tx.insert(aiPointLogs).values({
              userId,
              amount: -pointsToDeduct,
              beforePoints,
              afterPoints,
              type: "usage",
              description: `${provider.name} (${provider.model})`,
            });

            console.log(`[recordTokenUsage] Billed user ${userId} for shared provider: ${pointsToDeduct.toFixed(4)} points deducted.`);
          }
        }
      }
    });
  } catch (error) {
    console.error("[recordTokenUsage] Failed to record token usage:", error);
  }
}
