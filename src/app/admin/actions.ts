"use server";

import { db } from "@/db";
import { users, aiPointLogs, rooms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { invalidateSessionCache } from "@/auth.config";
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

  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  const displayName = formData.get("displayName") as string;

  if (!username || !password || !role || !displayName) throw new Error("Missing fields");

  const passwordHash = await bcrypt.hash(password, 10);

  await db.insert(users).values({
    username,
    passwordHash,
    role,
    displayName,
  });

  revalidatePath("/admin");
}

export async function deleteUser(id: number) {
  await requireAdmin();

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

export async function updateUserAiPoints(id: number, points: number) {
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

    // Log the change
    await tx.insert(aiPointLogs).values({
      userId: id,
      amount: afterPoints - beforePoints,
      beforePoints,
      afterPoints,
      type: "admin",
      description: "Admin adjusted points",
    });
  });

  revalidatePath("/admin");
}
