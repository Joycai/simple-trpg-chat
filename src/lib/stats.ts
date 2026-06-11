import { db } from "@/db";
import { dailyStats } from "@/db/schema";
import { sql, asc } from "drizzle-orm";

interface ActiveConnection {
  controller: ReadableStreamDefaultController;
  cleanup: () => void;
}

declare global {
  var __userConnections: Map<number, Set<ActiveConnection>> | undefined;
}

// Format a Date object as YYYY-MM-DD local string
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get the date string for today
export function getTodayString(): string {
  return formatDate(new Date());
}

export function getLiveOnlineCount(): number {
  const userConnections = globalThis.__userConnections;
  if (!userConnections) return 0;
  let count = 0;
  for (const [_, conns] of userConnections.entries()) {
    if (conns && conns.size > 0) {
      count++;
    }
  }
  return count;
}

export async function recordPageVisit() {
  const todayStr = getTodayString();
  const nowStr = new Date().toISOString();
  try {
    await db.insert(dailyStats)
      .values({
        date: todayStr,
        visitCount: 1,
        peakOnline: 0,
        updatedAt: nowStr
      })
      .onConflictDoUpdate({
        target: dailyStats.date,
        set: {
          visitCount: sql`daily_stats.visit_count + 1`,
          updatedAt: nowStr
        }
      });
  } catch (err) {
    console.error('[STATS] Failed to record page visit:', err);
  }
}

export async function updatePeakOnline() {
  const liveCount = getLiveOnlineCount();
  const todayStr = getTodayString();
  const nowStr = new Date().toISOString();
  try {
    await db.insert(dailyStats)
      .values({
        date: todayStr,
        visitCount: 0,
        peakOnline: liveCount,
        updatedAt: nowStr
      })
      .onConflictDoUpdate({
        target: dailyStats.date,
        set: {
          peakOnline: sql`GREATEST(daily_stats.peak_online, ${liveCount})`,
          updatedAt: nowStr
        }
      });
  } catch (err) {
    console.error('[STATS] Failed to update peak online:', err);
  }
}

export async function getHistoricalStats(range: "day" | "week" | "month" | "3month" | "year") {
  // Query all records from the db to aggregate them
  const rows = await db.select().from(dailyStats).orderBy(asc(dailyStats.date));
  const rowMap = new Map<string, { visitCount: number; peakOnline: number }>();
  for (const r of rows) {
    rowMap.set(r.date, { visitCount: r.visitCount, peakOnline: r.peakOnline });
  }

  const result: { label: string; visitCount: number; peakOnline: number }[] = [];
  const today = new Date();

  if (range === "day") {
    // Last 15 days, day by day
    for (let i = 14; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = formatDate(d);
      const data = rowMap.get(dateStr) || { visitCount: 0, peakOnline: 0 };
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({
        label,
        visitCount: data.visitCount,
        peakOnline: data.peakOnline,
      });
    }
  } else if (range === "week") {
    // Last 12 weeks, week by week.
    // Group by Monday-Sunday.
    const currentMonday = new Date(today);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0, 0, 0, 0);

    for (let i = 11; i >= 0; i--) {
      const monday = new Date(currentMonday);
      monday.setDate(currentMonday.getDate() - i * 7);
      
      let weekVisitSum = 0;
      let weekPeakMax = 0;
      
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + dayOffset);
        const dateStr = formatDate(d);
        const data = rowMap.get(dateStr);
        if (data) {
          weekVisitSum += data.visitCount;
          if (data.peakOnline > weekPeakMax) {
            weekPeakMax = data.peakOnline;
          }
        }
      }

      const label = `${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      result.push({
        label,
        visitCount: weekVisitSum,
        peakOnline: weekPeakMax,
      });
    }
  } else if (range === "month") {
    // Last 12 months, month by month
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      
      let monthVisitSum = 0;
      let monthPeakMax = 0;

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let dayVal = 1; dayVal <= daysInMonth; dayVal++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;
        const data = rowMap.get(dateStr);
        if (data) {
          monthVisitSum += data.visitCount;
          if (data.peakOnline > monthPeakMax) {
            monthPeakMax = data.peakOnline;
          }
        }
      }

      const label = `${year}-${String(month + 1).padStart(2, '0')}`;
      result.push({
        label,
        visitCount: monthVisitSum,
        peakOnline: monthPeakMax,
      });
    }
  } else if (range === "3month") {
    // Last 4 rolling 3-month blocks (quarters)
    for (let i = 3; i >= 0; i--) {
      const startMonthDate = new Date(today.getFullYear(), today.getMonth() - (i * 3) - 2, 1);
      const endMonthDate = new Date(today.getFullYear(), today.getMonth() - (i * 3) + 1, 0);
      
      let visitSum = 0;
      let peakMax = 0;

      const tempDate = new Date(startMonthDate);
      while (tempDate <= endMonthDate) {
        const dateStr = formatDate(tempDate);
        const data = rowMap.get(dateStr);
        if (data) {
          visitSum += data.visitCount;
          if (data.peakOnline > peakMax) {
            peakMax = data.peakOnline;
          }
        }
        tempDate.setDate(tempDate.getDate() + 1);
      }

      const label = `${String(startMonthDate.getMonth() + 1).padStart(2, '0')}~${String(endMonthDate.getMonth() + 1).padStart(2, '0')}`;
      result.push({
        label,
        visitCount: visitSum,
        peakOnline: peakMax,
      });
    }
  } else if (range === "year") {
    // Last 5 years
    const currentYear = today.getFullYear();
    for (let i = 4; i >= 0; i--) {
      const year = currentYear - i;
      
      let yearVisitSum = 0;
      let yearPeakMax = 0;

      for (const [dateStr, data] of rowMap.entries()) {
        if (dateStr.startsWith(`${year}-`)) {
          yearVisitSum += data.visitCount;
          if (data.peakOnline > yearPeakMax) {
            yearPeakMax = data.peakOnline;
          }
        }
      }

      const label = `${year}`;
      result.push({
        label,
        visitCount: yearVisitSum,
        peakOnline: yearPeakMax,
      });
    }
  }

  return result;
}
