"use server";

import { db } from "@/db";
import { users, aiPointLogs } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { auth } from "@/auth";

export interface PointLogEntry {
  id: number;
  amount: number;
  beforePoints: number;
  afterPoints: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export interface DailyUsageEntry {
  day: string;
  points: number;
}

export interface AiPointsInfo {
  balance: number;
  logs: PointLogEntry[];
  dailyUsage: DailyUsageEntry[];
}

export async function getMyAiPointsInfo(): Promise<AiPointsInfo> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);

  // 1. Fetch current balance
  const [user] = await db
    .select({ aiPoints: users.aiPoints })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const balance = user ? user.aiPoints : 0;

  // 2. Fetch point logs (balance change history)
  const logs = await db
    .select()
    .from(aiPointLogs)
    .where(eq(aiPointLogs.userId, userId))
    .orderBy(desc(aiPointLogs.createdAt))
    .limit(100);

  // 3. Fetch point logs of type 'usage' from the last 30 days to calculate daily consumption
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const usageLogs = await db
    .select({
      day: sql<string>`to_char(${aiPointLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      points: sql<number>`SUM(ABS(${aiPointLogs.amount}))`,
    })
    .from(aiPointLogs)
    .where(
      and(
        eq(aiPointLogs.userId, userId),
        eq(aiPointLogs.type, "usage"),
        sql`${aiPointLogs.createdAt} >= ${thirtyDaysAgoStr}`
      )
    )
    .groupBy(sql`to_char(${aiPointLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

  const dailyUsage = usageLogs
    .map((log) => ({
      day: log.day,
      points: Number(log.points || 0),
    }))
    .sort((a, b) => b.day.localeCompare(a.day));

  return {
    balance,
    logs: logs.map(l => ({
      id: l.id,
      amount: l.amount,
      beforePoints: l.beforePoints,
      afterPoints: l.afterPoints,
      type: l.type,
      description: l.description,
      createdAt: l.createdAt,
    })),
    dailyUsage,
  };
}
