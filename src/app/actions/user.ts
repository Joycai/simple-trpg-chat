"use server";

import { db, sqlNow } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/auth";
import { invalidateSessionCache } from "@/auth.config";
import { revokeSessions } from "@/lib/auth/session-revocation";
import { passwordPolicyError } from "@/lib/auth/password-policy";
import type { Done } from "@/lib/actions/result";

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

/**
 * Change the signed-in user's own password. Returns a result object: a thrown
 * message would be redacted by Next.js in production, hiding "wrong password".
 * The password strings live in the `admin` namespace, shared with the admin
 * panel's modal.
 *
 * Rotation matters: a changed password must also invalidate anything signed in
 * with the OLD one. We rotate the single-session token, so this tab is signed
 * out too — the caller renders the success message and the UI asks to sign in
 * again. Keeping the current session while killing all others would need a
 * per-device session table, which this app deliberately does not have.
 */
export async function changeOwnPassword(
  oldPassword: string,
  newPassword: string,
): Promise<Done> {
  const t = await getTranslations("admin");
  const session = await auth();
  if (!session) return { success: false, error: t("passwordResetFail") };
  const policy = passwordPolicyError(newPassword);
  if (policy === "tooShort") return { success: false, error: t("passwordTooShort") };
  if (policy === "tooLong") return { success: false, error: t("passwordTooLong") };
  const userId = parseInt(session.user.id);

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { success: false, error: t("passwordResetFail") };

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) return { success: false, error: t("errorCurrentPassword") };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Invalidate every JWT issued before this change (including the caller's).
  await revokeSessions(userId);
  return { success: true };
}
