"use server";

import { db } from "@/db";
import { loginHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";

/** Get current user's login history (last 30) */
export async function getMyLoginHistory() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt(session.user.id);
  if (isNaN(userId)) throw new Error("Invalid user ID");

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
  if (!session || session.user.role !== "admin") {
    throw new Error("Only admin can view login history");
  }

  return await db
    .select()
    .from(loginHistory)
    .where(eq(loginHistory.userId, userId))
    .orderBy(desc(loginHistory.loginAt))
    .limit(30);
}
