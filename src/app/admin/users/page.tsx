import { db } from "@/db";
import { users, loginHistory } from "@/db/schema";
import { sql } from "drizzle-orm";
import { sweepExpiredInvites, getInviteConfig } from "@/lib/invites";
import { AdminUserManager } from "@/components/admin/users/AdminUserManager";

export default async function AdminUsersPage() {
  // Lazy invite expiry sweep so the quota column reflects refunded codes.
  await db.transaction(async (tx) => sweepExpiredInvites(tx));

  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    role: users.role,
    isBot: users.isBot,
    isBanned: users.isBanned,
    aiPoints: users.aiPoints,
    inviteQuota: users.inviteQuota,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users);

  // Most-recent login per user (real "last login" data, not stored on the user row)
  const lastLoginRows = await db
    .select({ userId: loginHistory.userId, last: sql<string>`max(${loginHistory.loginAt})` })
    .from(loginHistory)
    .groupBy(loginHistory.userId);
  const lastLogins: Record<number, string> = {};
  for (const r of lastLoginRows) if (r.last) lastLogins[r.userId] = r.last;

  const { defaultQuota } = await getInviteConfig();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <AdminUserManager users={allUsers} lastLogins={lastLogins} inviteDefaultQuota={defaultQuota} />
    </div>
  );
}
