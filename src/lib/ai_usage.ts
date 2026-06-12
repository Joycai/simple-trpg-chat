import { db, sqlNow } from "@/db";
import { aiTokenUsages, aiProviders, users } from "@/db/schema";
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

    await db.insert(aiTokenUsages).values({
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
    const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId)).limit(1);
    if (provider && provider.isShared) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user && user.role !== "admin") {
        const rateInput = Number(provider.tokenRateInput || 0);
        const rateCached = Number(provider.tokenRateCached || 0);
        const rateOutput = Number(provider.tokenRateOutput || 0);
        const points = (inputTokens * rateInput) + (cachedInputTokens * rateCached) + (outputTokens * rateOutput);

        if (points > 0) {
          await db.update(users)
            .set({
              aiPoints: sql`GREATEST(0, ${users.aiPoints} - ${points})`
            })
            .where(eq(users.id, userId));
          console.log(`[recordTokenUsage] Billed user ${userId} for shared provider: ${points.toFixed(4)} points deducted.`);
        }
      }
    }
  } catch (error) {
    console.error("[recordTokenUsage] Failed to record token usage:", error);
  }
}
