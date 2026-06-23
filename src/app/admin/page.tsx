import { db, currentDialect } from "@/db";
import { users, systemConfig, rooms } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const allUsers = await db.select().from(users);
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";
  const dbType = currentDialect;

  const adminCount = allUsers.filter(u => u.role === "admin").length;
  const hostCount = allUsers.filter(u => u.role === "host").length;
  const playerCount = allUsers.filter(u => u.role === "player").length;
  const botCountResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isBot, true));
  const botCount = botCountResult[0]?.count || 0;
  const roomCountResult = await db.select({ count: sql<number>`count(*)` }).from(rooms);
  const roomCount = roomCountResult[0]?.count || 0;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <AdminDashboard
        dbType={dbType}
        totalUsers={allUsers.length}
        adminCount={adminCount}
        hostCount={hostCount}
        playerCount={playerCount}
        botCount={botCount}
        roomCount={roomCount}
        aiEnabled={aiEnabled}
      />
    </div>
  );
}
