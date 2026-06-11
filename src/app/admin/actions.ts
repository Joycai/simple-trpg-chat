"use server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    throw new Error("Unauthorized: Admin access required");
  }
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as any;
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
  const userId = parseInt((session.user as any).id);

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) throw new Error("当前密码错误");

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

  revalidatePath("/admin");
}
