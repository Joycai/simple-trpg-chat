"use server";

import { requireAdmin } from "@/app/admin/actions";
import { getLiveOnlineCount, updatePeakOnline, getHistoricalStats, getTodayString } from "@/lib/stats";
import { db } from "@/db";
import { dailyStats } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getServerStatsAction(range: "day" | "week" | "month" | "3month" | "year") {
  await requireAdmin();

  // Make sure today's peak online matches current online peak in DB
  await updatePeakOnline();

  const liveOnlineCount = getLiveOnlineCount();
  const todayStr = getTodayString();

  const [todayRecord] = await db
    .select()
    .from(dailyStats)
    .where(eq(dailyStats.date, todayStr))
    .limit(1);

  const series = await getHistoricalStats(range);

  return {
    liveOnlineCount,
    today: {
      visitCount: todayRecord?.visitCount ?? 0,
      peakOnline: Math.max(todayRecord?.peakOnline ?? 0, liveOnlineCount),
    },
    series,
  };
}
