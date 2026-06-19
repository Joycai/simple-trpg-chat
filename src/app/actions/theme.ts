"use server";

import { db, sqlNow } from "@/db";
import { users, systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import type { ThemeId } from "@/themes/types";

/** Safe userId extraction — guards against NaN */
function getUserId(session: { user?: { id?: string } }): number | null {
  const id = parseInt(session?.user?.id ?? "");
  return isNaN(id) ? null : id;
}

/**
 * Get the site-wide default theme from system_config.
 * Falls back to "default" if not set.
 */
export async function getSiteTheme(): Promise<ThemeId> {
  try {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_theme"));

    return (row?.value as ThemeId) || "default";
  } catch {
    // DB may not be available during static generation (login page)
    return "default";
  }
}

/**
 * Set the site-wide default theme (admin only).
 */
export async function setSiteTheme(theme: ThemeId) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    throw new Error("Only admin can set site theme");
  }

  await db
    .insert(systemConfig)
    .values({ key: "site_theme", value: theme, updatedAt: sqlNow() })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: theme, updatedAt: sqlNow() },
    });

  return { success: true };
}

/**
 * Get the current user's theme preference.
 * Returns null if not set (meaning: use site default).
 */
export async function getUserThemePreference(): Promise<ThemeId | null> {
  const session = await auth();
  if (!session) return null;

  const userId = getUserId(session);
  if (!userId) return null;

  const [user] = await db
    .select({ themePreference: users.themePreference })
    .from(users)
    .where(eq(users.id, userId));

  return (user?.themePreference as ThemeId) || null;
}

/**
 * Update the site favicon (admin only).
 * Accepts a base64 data URL or empty string to reset to the static favicon.ico.
 */
export async function updateSiteFavicon(dataUrl: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  if (dataUrl !== "" && !dataUrl.startsWith("data:image/")) {
    return { success: false, error: "Invalid format" };
  }
  if (dataUrl.length > 700_000) {
    return { success: false, error: "File too large" };
  }

  await db
    .insert(systemConfig)
    .values({ key: "site_favicon", value: dataUrl, updatedAt: sqlNow() })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: dataUrl, updatedAt: sqlNow() },
    });

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Save the user's personal theme preference.
 */
export async function updateUserThemePreference(theme: ThemeId) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = getUserId(session);
  if (!userId) throw new Error("Invalid user session");

  await db
    .update(users)
    .set({ themePreference: theme, updatedAt: sqlNow() })
    .where(eq(users.id, userId));

  return { success: true };
}
