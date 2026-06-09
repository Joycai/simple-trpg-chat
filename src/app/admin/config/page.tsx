import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminAiToggle } from "@/components/AdminAiToggle";

export default async function AdminConfigPage() {
  const t = await getTranslations("admin");
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";
  const [dbTypeConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "db_type"));
  const dbType = dbTypeConfig?.value || "sqlite";

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-purple-100">{t("systemConfig") || "系统配置"}</h1>
        <p className="text-sm text-purple-400/60 mt-1">{t("systemConfigDesc") || "管理全局系统设置"}</p>
      </div>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {t("aiToggle") || "AI 功能开关"}
        </h3>
        <AdminAiToggle initialEnabled={aiEnabled} />
      </section>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          {t("dbConfig") || "数据库配置"}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-purple-300/70">{t("dbType") || "数据库类型"}</span>
          <span className="text-sm font-bold text-purple-200">{dbType === "postgresql" ? "🐘 PostgreSQL" : "📦 SQLite"}</span>
        </div>
        <p className="text-[10px] text-purple-400/30 mt-2">{t("dbConfigHint") || "数据库类型由 db.config.json 决定，修改后重启服务生效。"}</p>
      </section>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {t("aiInstructions") || "AI 使用说明"}
        </h3>
        <div className="text-sm text-purple-300/70 space-y-2">
          <p>1. {t("aiInstruction1") || "开启 AI 功能后，Host 可以在房间中配置自己的 AI API"}</p>
          <p>2. {t("aiInstruction2") || "支持的 API：OpenAI、DeepSeek、Claude 等兼容接口"}</p>
          <p>3. {t("aiInstruction3") || "Host 可以创建 AI Bot 作为 NPC 参与跑团"}</p>
          <p>4. {t("aiInstruction4") || "AI 智能导入功能需要 AI 已启用"}</p>
        </div>
      </section>
    </div>
  );
}
