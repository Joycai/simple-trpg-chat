"use server";

import { db, sqlNow } from "@/db";
import { loginHistory, DEVICE_TYPES } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { auth } from "@/auth";
import type { DeviceType } from "@/db/schema";
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

    // Cleanup: keep only last 30 records per user
    const rows = await db
      .select({ id: loginHistory.id })
      .from(loginHistory)
      .where(eq(loginHistory.userId, userId))
      .orderBy(desc(loginHistory.loginAt))
      .offset(30);

    if (rows.length > 0) {
      const idsToDelete = rows.map((r) => r.id);
      await db.delete(loginHistory).where(
        and(eq(loginHistory.userId, userId), sql`${loginHistory.id} IN (${idsToDelete.join(",")})`)
      );
    }
  } catch {
    // Silent fail — don't block login if logging fails
  }
}

/** Get current user's login history (last 30) */
export async function getMyLoginHistory() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);
  return await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.loginAt))
    .limit(30);
}

/** Admin: get any user's login history */
export async function getUserLoginHistory(userId: number) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Only admin can view login history");
  }

  return await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.loginAt))
    .limit(30);
}
