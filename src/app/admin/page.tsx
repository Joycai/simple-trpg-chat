import { db } from "@/db";
import { users, systemConfig, rooms } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createUser, deleteUser } from "./actions";
import { AdminAiToggle } from "@/components/AdminAiToggle";
import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminUserManager } from "@/components/AdminUserManager";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const allUsers = await db.select().from(users);
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";

  // Stats for dashboard
  const adminCount = allUsers.filter(u => u.role === "admin").length;
  const hostCount = allUsers.filter(u => u.role === "host").length;
  const playerCount = allUsers.filter(u => u.role === "player").length;
  const botCountResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isBot, true));
  const botCount = botCountResult[0]?.count || 0;
  const roomCountResult = await db.select({ count: sql<number>`count(*)` }).from(rooms);
  const roomCount = roomCountResult[0]?.count || 0;
  const [dbTypeConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "db_type"));
  const dbType = dbTypeConfig?.value || "sqlite";

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-100">{t("dashboardTitle")}</h1>
          <p className="text-sm text-purple-400/60 mt-1">{t("dashboardDesc")}</p>
        </div>
        <span className="text-xs text-purple-400/40 font-mono">{t("versionLabel")}</span>
      </div>

      {/* Dashboard Tab Content */}
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

      {/* User Management */}
      <AdminUserManager users={allUsers as any[]} />

      {/* Feature Config */}
      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {t("featureConfig")}
        </h3>
        <AdminAiToggle initialEnabled={aiEnabled} />
      </section>
    </div>
  );
}
