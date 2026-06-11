"use server";

import { cookies } from "next/headers";

/**
 * Set the user's preferred locale in cookies.
 */
export async function setUserLocale(locale: "zh" | "en") {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    httpOnly: false, // Accessible to client-side JS if needed
    sameSite: "lax",
  });
  return { success: true };
}

/**
 * Get the current user's preferred locale from cookies.
 */
export async function getUserLocale() {
  const cookieStore = await cookies();
  return cookieStore.get("NEXT_LOCALE")?.value || "zh";
}
