import { db } from "@/db";
import { users, systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { createUser, deleteUser } from "./actions";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  const allUsers = await db.select().from(users);
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";

  const adminCount = allUsers.filter(u => u.role === "admin").length;
  const hostCount = allUsers.filter(u => u.role === "host").length;
  const playerCount = allUsers.filter(u => u.role === "player").length;

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-100">{t("title")}</h1>
          <p className="text-sm text-purple-400/60 mt-1">Admin Console v1.0</p>
        </div>
        <span className="text-xs text-purple-400/40 font-mono">Admin Console v1.0</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总用户" value={allUsers.length} color="purple" />
        <StatCard label="管理员" value={adminCount} color="rose" />
        <StatCard label="主持人" value={hostCount} color="emerald" />
        <StatCard label="玩家" value={playerCount} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create User */}
        <section className="lg:col-span-1 bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
          <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            {t("createUser")}
          </h3>
          <form action={createUser} className="flex flex-col gap-3">
            <input name="username" placeholder={t("username")} required
              className="p-2.5 bg-[#0a0e1a] border border-purple-500/20 rounded-lg text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <input name="password" type="password" placeholder={t("password")} required
              className="p-2.5 bg-[#0a0e1a] border border-purple-500/20 rounded-lg text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <input name="displayName" placeholder={t("displayName")} required
              className="p-2.5 bg-[#0a0e1a] border border-purple-500/20 rounded-lg text-purple-100 text-sm placeholder:text-purple-400/30 focus:border-purple-400/50 outline-none" />
            <select name="role" required
              className="p-2.5 bg-[#0a0e1a] border border-purple-500/20 rounded-lg text-purple-100 text-sm focus:border-purple-400/50 outline-none">
              <option value="player">{t("rolePlayer")}</option>
              <option value="host">{t("roleHost")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
            <button type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-lg font-bold text-sm transition shadow-lg shadow-purple-600/25">
              {t("submit")}
            </button>
          </form>

          {/* AI Status */}
          <div className="mt-4 pt-4 border-t border-purple-500/10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-400/60">AI 功能</span>
              <span className={`px-2 py-0.5 rounded-full font-bold ${aiEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-purple-500/20 text-purple-400"}`}>
                {aiEnabled ? "已启用" : "已禁用"}
              </span>
            </div>
            <p className="text-[10px] text-purple-400/30 mt-1">在 AI 配置页面管理 AI 设置</p>
          </div>
        </section>

        {/* User List */}
        <section className="lg:col-span-2 bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
          <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {t("userList")}
            <span className="text-xs text-purple-400/40 font-normal ml-auto">{allUsers.length} 用户</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-purple-400/60 text-xs border-b border-purple-500/20">
                  <th className="pb-2.5 font-medium">{t("username")}</th>
                  <th className="pb-2.5 font-medium">{t("displayName")}</th>
                  <th className="pb-2.5 font-medium">{t("role")}</th>
                  <th className="pb-2.5 font-medium text-right">{t("delete")}</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-purple-400/30 text-sm">{t("noUsers")}</td></tr>
                ) : (
                  allUsers.map((user: any) => (
                    <tr key={user.id} className="border-b border-purple-500/10 last:border-0 hover:bg-purple-500/5 transition">
                      <td className="py-3 font-mono text-sm text-purple-200">{user.username}</td>
                      <td className="py-3 text-purple-300 text-sm">{user.displayName}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          user.role === "admin" ? "bg-rose-500/20 text-rose-400" :
                          user.role === "host" ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-blue-500/20 text-blue-400"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <form action={deleteUser.bind(null, user.id)} className="inline">
                          <button className="text-rose-400/60 hover:text-rose-400 text-xs transition disabled:opacity-20" disabled={user.username === "admin"}>
                            {user.username === "admin" ? "—" : t("delete")}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    purple: "border-purple-500/30 bg-purple-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
  };
  const textColors: Record<string, string> = {
    purple: "text-purple-400",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.purple}`}>
      <div className="text-xs text-purple-400/50 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColors[color] || textColors.purple}`}>{value}</div>
    </div>
  );
}
