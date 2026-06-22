"use server";

import { auth, signOut } from "@/auth";
import { invalidateSessionCache } from "@/auth.config";

export async function logoutAction() {
  // Clear the rotated single-session token so a leaked/retained JWT can't be reused
  // after logout. Best-effort — never let this block the actual sign-out.
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      const { db, sqlNow } = await import("@/db");
      const { users } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ sessionToken: null, updatedAt: sqlNow() }).where(eq(users.id, parseInt(userId)));
      invalidateSessionCache(userId);
    }
  } catch {
    // ignore — sign-out below is what matters
  }

  await signOut({ redirectTo: "/login" });
}
