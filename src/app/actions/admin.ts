"use server";

import { db } from "@/db";
import { users, aiPointLogs, rooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { invalidateSessionCache } from "@/auth.config";
import { broadcastToRoom } from "@/lib/server/events";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { USERNAME_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH } from "@/lib/auth/user-limits";
import type { Done, Fail } from "@/lib/actions/result";

/*
 * Write actions return `{ success: true, ... } | { success: false, error }`,
 * with `error` localized server-side (same convention as notebook.ts /
 * background.ts). They used to throw bare English `Error`s, which Next.js
 * redacts in production — the admin then saw "An error occurred in the Server
 * Components render…" instead of, say, "this user still hosts 2 rooms".
 */

/** requireAdmin throws (it is shared); the write actions need a boolean. */
async function adminGuard(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

export async function createUser(formData: FormData): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  const username = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  // Nickname is optional — fall back to the username when the admin leaves it blank.
  const displayName = (formData.get("displayName") as string)?.trim() || username;
  // Initial AI quota granted at creation; clamp to a non-negative integer.
  const aiPoints = Math.max(0, Math.floor(Number(formData.get("aiPoints")) || 0));

  if (!username || !password || !role) return { success: false, error: t("errorMissingFields") };

  const allowedRoles = ["player", "host", "admin"];
  if (!allowedRoles.includes(role)) return { success: false, error: t("errorInvalidRole") };
  if (username.length > USERNAME_MAX_LENGTH) {
    return { success: false, error: t("errorFieldTooLong", { max: USERNAME_MAX_LENGTH }) };
  }
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { success: false, error: t("errorFieldTooLong", { max: DISPLAY_NAME_MAX_LENGTH }) };
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (existing) {
    const tRegister = await getTranslations("register");
    return { success: false, error: tRegister("errorUsernameTaken") };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // New hosts start with the configured default invite quota.
  const inviteQuota = role === "host"
    ? (await (await import("@/lib/auth/invites")).getInviteConfig()).defaultQuota
    : 0;

  await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({
      username,
      passwordHash,
      role,
      displayName,
      aiPoints,
      inviteQuota,
    }).returning({ id: users.id });

    // Record the opening balance so the points history stays consistent with
    // every later admin adjustment (which always writes an aiPointLogs row).
    if (aiPoints > 0) {
      await tx.insert(aiPointLogs).values({
        userId: created.id,
        amount: aiPoints,
        beforePoints: 0,
        afterPoints: aiPoints,
        type: "admin",
        description: "Initial points on account creation",
      });
    }
  });

  revalidatePath("/admin");
  return { success: true };
}

export async function updateUser(id: number, displayName: string, role: string): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  const allowedRoles = ["player", "host", "admin"];
  if (!allowedRoles.includes(role)) return { success: false, error: t("errorInvalidRole") };
  const name = displayName.trim();
  if (!name) return { success: false, error: t("errorMissingDisplayName") };
  if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    return { success: false, error: t("errorFieldTooLong", { max: DISPLAY_NAME_MAX_LENGTH }) };
  }

  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return { success: false, error: t("errorUserNotFound") };
  // Never let the built-in admin be demoted out of the admin role (lockout guard).
  if (user.username === "admin" && role !== "admin") return { success: false, error: t("errorCannotDemoteDefaultAdmin") };

  // Promotion to host grants the configured default invite quota; any other
  // role change zeroes it (players/admins don't generate codes).
  const patch: { displayName: string; role: string; updatedAt: string; inviteQuota?: number } = {
    displayName: name,
    role,
    updatedAt: new Date().toISOString(),
  };
  if (role === "host" && user.role !== "host") {
    const { getInviteConfig } = await import("@/lib/auth/invites");
    patch.inviteQuota = (await getInviteConfig()).defaultQuota;
  } else if (role !== "host" && user.role === "host") {
    patch.inviteQuota = 0;
  }

  await db.update(users)
    .set(patch)
    .where(eq(users.id, id));

  // A role change must refresh the cached session so it takes effect immediately.
  invalidateSessionCache(String(id));
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Reset a host's remaining invite-code quota back to the configured default
 * (`invite_default_quota`, clamped 0–99). Host-only by design — players don't
 * generate codes and admins create accounts directly.
 */
export async function resetInviteQuotaAction(id: number): Promise<{ success: true; quota: number } | Fail> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!user) return { success: false, error: t("errorUserNotFound") };
  if (user.role !== "host") return { success: false, error: t("errorQuotaHostsOnly") };

  const { getInviteConfig } = await import("@/lib/auth/invites");
  const { defaultQuota } = await getInviteConfig();

  await db.update(users)
    .set({ inviteQuota: defaultQuota, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id));

  revalidatePath("/admin");
  return { success: true, quota: defaultQuota };
}

export async function deleteUser(id: number): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  // Guard against the destructive cascade: deleting a host would wipe every room
  // they own (and all members' messages/items/clues in them). Require those rooms
  // to be transferred or deleted first.
  const hosted = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hostId, id));
  if (hosted.length > 0) {
    return { success: false, error: t("deleteUserHostsRooms", { count: hosted.length }) };
  }

  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteRoom(id: number): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  // Background FILES live outside the DB — remove them before the row delete
  // cascades away the room_backgrounds rows that name them (best-effort; a
  // leftover file is harmless and admin cleanup can sweep it later).
  const { cleanupRoomBackgrounds } = await import("@/lib/media/image-cache");
  await cleanupRoomBackgrounds(id).catch((err) => {
    console.error("[admin] Failed to remove room background files:", err);
  });

  // All room-scoped tables cascade on rooms.id delete (members, messages,
  // skills, dm reads, inventory items/distributions, clue cards, backgrounds).
  await db.delete(rooms).where(eq(rooms.id, id));
  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function adminSetRoomFrozen(id: number, frozen: boolean): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };
  await db.update(rooms).set({ frozen }).where(eq(rooms.id, id));
  // Notify any live members so the freeze takes effect without a manual reload.
  broadcastToRoom(id, { type: "room_settings_updated" });
  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function adminSetRoomStatus(id: number, status: "active" | "closed"): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };
  if (status !== "active" && status !== "closed") return { success: false, error: t("errorInvalidStatus") };
  await db.update(rooms).set({ status }).where(eq(rooms.id, id));
  broadcastToRoom(id, { type: "room_settings_updated" });
  revalidatePath("/admin/rooms");
  return { success: true };
}

export async function resetPassword(id: number, newPassword: string): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleBanUser(id: number): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) return { success: false, error: t("errorUserNotFound") };
  if (user.username === "admin") return { success: false, error: t("errorCannotBanDefaultAdmin") };

  const newBanStatus = !user.isBanned;

  await db.update(users)
    .set({
      isBanned: newBanStatus,
      sessionToken: newBanStatus ? null : user.sessionToken,
    })
    .where(eq(users.id, id));

  // Immediately invalidate the session cache so the ban takes effect without delay
  invalidateSessionCache(String(id));

  revalidatePath("/admin");
  return { success: true };
}

export async function updateUserAiPoints(id: number, points: number, note?: string): Promise<Done> {
  const t = await getTranslations("admin");
  if (!(await adminGuard())) return { success: false, error: t("errorNotAdmin") };

  // Checked before the transaction: a Fail returned from inside the callback
  // would let the transaction commit instead of rolling back.
  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!target) return { success: false, error: t("errorUserNotFound") };
  if (target.role === "admin") return { success: false, error: t("errorCannotModifyAdminPoints") };

  const outcome = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    // Re-checked under the row lock; nothing has been written yet, so bailing
    // out here leaves an empty transaction to commit.
    if (!user) return "notFound" as const;
    if (user.role === "admin") return "admin" as const;

    const beforePoints = Number(user.aiPoints || 0);
    const afterPoints = Math.max(0, Number(points.toFixed(6)));

    await tx.update(users)
      .set({
        aiPoints: afterPoints
      })
      .where(eq(users.id, id));

    // Log the change — use the admin-provided note as the description when present.
    await tx.insert(aiPointLogs).values({
      userId: id,
      amount: afterPoints - beforePoints,
      beforePoints,
      afterPoints,
      type: "admin",
      description: note?.trim() || "Admin adjusted points",
    });
    return "ok" as const;
  });
  if (outcome === "notFound") return { success: false, error: t("errorUserNotFound") };
  if (outcome === "admin") return { success: false, error: t("errorCannotModifyAdminPoints") };

  revalidatePath("/admin");
  return { success: true };
}
