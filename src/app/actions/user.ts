"use server";

import { db, sqlNow } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { invalidateSessionCache } from "@/auth.config";

export async function logoutAction() {
  // Clear the rotated single-session token so a leaked/retained JWT can't be reused
  // after logout. Best-effort — never let this block the actual sign-out.
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      await db.update(users).set({ sessionToken: null, updatedAt: sqlNow() }).where(eq(users.id, parseInt(userId)));
      invalidateSessionCache(userId);
    }
  } catch {
    // ignore — sign-out below is what matters
  }

  await signOut({ redirectTo: "/login" });
}

export async function changeOwnPassword(oldPassword: string, newPassword: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt(session.user.id);

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    const t = await getTranslations("admin");
    throw new Error(t("errorCurrentPassword"));
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  revalidatePath("/admin");
}
