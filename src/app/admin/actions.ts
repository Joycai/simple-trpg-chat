"use server";

import { db } from "@/db";
import { users, aiPointLogs, rooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { invalidateSessionCache } from "@/auth.config";
import { broadcastToRoom } from "@/lib/events";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

export async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
  }
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const username = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  // Nickname is optional — fall back to the username when the admin leaves it blank.
  const displayName = (formData.get("displayName") as string)?.trim() || username;
  // Initial AI quota granted at creation; clamp to a non-negative integer.
  const aiPoints = Math.max(0, Math.floor(Number(formData.get("aiPoints")) || 0));

  if (!username || !password || !role) throw new Error("Missing fields");

  const allowedRoles = ["player", "host", "admin"];
  if (!allowedRoles.includes(role)) throw new Error("Invalid role");

  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values({
      username,
      passwordHash,
      role,
      displayName,
      aiPoints,
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
}

export async function updateUser(id: number, displayName: string, role: string) {
  await requireAdmin();

  const allowedRoles = ["player", "host", "admin"];
  if (!allowedRoles.includes(role)) throw new Error("Invalid role");
  const name = displayName.trim();
  if (!name) throw new Error("Missing display name");

  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("User not found");
  // Never let the built-in admin be demoted out of the admin role (lockout guard).
  if (user.username === "admin" && role !== "admin") throw new Error("Cannot change the default admin's role");

  await db.update(users)
    .set({ displayName: name, role, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id));

  // A role change must refresh the cached session so it takes effect immediately.
  invalidateSessionCache(String(id));
  revalidatePath("/admin");
}

export async function deleteUser(id: number) {
  await requireAdmin();

  // Guard against the destructive cascade: deleting a host would wipe every room
  // they own (and all members' messages/items/clues in them). Require those rooms
  // to be transferred or deleted first.
  const hosted = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.hostId, id));
  if (hosted.length > 0) {
    const t = await getTranslations("admin");
    throw new Error(t("deleteUserHostsRooms", { count: hosted.length }));
  }

  await db.delete(users).where(eq(users.id, id));
  revalidatePath("/admin");
}

export async function deleteRoom(id: number) {
  await requireAdmin();

  // All room-scoped tables cascade on rooms.id delete (members, messages,
  // skills, dm reads, inventory items/distributions, clue cards).
  await db.delete(rooms).where(eq(rooms.id, id));
  revalidatePath("/admin/rooms");
}

export async function adminSetRoomFrozen(id: number, frozen: boolean) {
  await requireAdmin();
  await db.update(rooms).set({ frozen }).where(eq(rooms.id, id));
  // Notify any live members so the freeze takes effect without a manual reload.
  broadcastToRoom(id, { type: "room_settings_updated" });
  revalidatePath("/admin/rooms");
}

export async function adminSetRoomStatus(id: number, status: "active" | "closed") {
  await requireAdmin();
  if (status !== "active" && status !== "closed") throw new Error("Invalid status");
  await db.update(rooms).set({ status }).where(eq(rooms.id, id));
  broadcastToRoom(id, { type: "room_settings_updated" });
  revalidatePath("/admin/rooms");
}

export async function resetPassword(id: number, newPassword: string) {
  await requireAdmin();

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
  revalidatePath("/admin");
}

export async function changeOwnPassword(oldPassword: string, newPassword: string) {
  "use server";
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

export async function toggleBanUser(id: number) {
  await requireAdmin();

  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("User not found");
  if (user.username === "admin") throw new Error("Cannot ban the default admin");

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
}

export async function updateUserAiPoints(id: number, points: number, note?: string) {
  await requireAdmin();

  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, id)).for('update');
    if (!user) throw new Error("User not found");
    if (user.role === "admin") throw new Error("Cannot modify points for admin users");

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
  });

  revalidatePath("/admin");
}
