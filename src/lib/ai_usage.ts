import { db, sqlNow } from "@/db";
import { aiTokenUsages } from "@/db/schema";
import { sql } from "drizzle-orm";

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
  } catch (error) {
    console.error("[recordTokenUsage] Failed to record token usage:", error);
  }
}
