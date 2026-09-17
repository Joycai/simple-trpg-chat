import { db } from "@/db";
import { loginHistory } from "@/db/schema";
import type { DeviceType } from "@/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";

/** Parse User-Agent to detect device type */
function detectDevice(userAgent: string | null): DeviceType {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|webos/.test(ua)) return "mobile";
  if (/ipad|tablet|kindle|silk/.test(ua)) return "tablet";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "unknown";
}

/** Get client IP from request headers */
async function getClientIP(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim()
      || h.get("x-real-ip")
      || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

/**
 * Record a login event. Called from the login flow.
 * Auto-cleans old records beyond 30.
 */
export async function recordLogin(userId: number) {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent") || null;
    const ip = await getClientIP();
    const deviceType = detectDevice(userAgent);

    await db.insert(loginHistory).values({
      userId,
      ipAddress: ip,
      userAgent,
      deviceType,
    });

    // Cleanup: keep only last 30 records per user (single query)
    await db.execute(sql`
      DELETE FROM ${loginHistory}
      WHERE ${loginHistory.userId} = ${userId}
        AND ${loginHistory.id} NOT IN (
          SELECT ${loginHistory.id} FROM ${loginHistory}
          WHERE ${loginHistory.userId} = ${userId}
          ORDER BY ${loginHistory.loginAt} DESC
          LIMIT 30
        )
    `);
  } catch (error) {
    // Silent fail — don't block login if logging fails
    console.error("[recordLogin] failed:", error);
  }
}
