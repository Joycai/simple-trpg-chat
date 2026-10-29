import "server-only";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

/** Merge only summary fields into the latest config; a concurrent summary must not regress the cursor. */
export async function saveSummary(botUserId: number, baseline: { historicalSummary: string; lastSummarizedMsgId: number }, historicalSummary: string, lastSummarizedMsgId: number) {
  const patch = JSON.stringify({ historicalSummary, lastSummarizedMsgId });
  await db.update(users).set({
    botConfigJson: sql`(coalesce(${users.botConfigJson}, '{}')::jsonb || ${patch}::jsonb)::text`,
  }).where(and(eq(users.id, botUserId),
    sql`coalesce((${users.botConfigJson}::jsonb->>'lastSummarizedMsgId')::bigint, 0) = ${baseline.lastSummarizedMsgId}`,
    sql`coalesce(${users.botConfigJson}::jsonb->>'historicalSummary', '') = ${baseline.historicalSummary}`));
}
