import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminAiToggle } from "@/components/AdminAiToggle";

export default async function AdminAiPage() {
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";
  const t = await getTranslations("admin");

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-purple-100">{t("aiConfig")}</h1>
        <p className="text-sm text-purple-400/60 mt-1">{t("aiConfigDesc")}</p>
      </div>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {t("aiToggle")}
        </h3>
        <AdminAiToggle initialEnabled={aiEnabled} />
      </section>

      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          {t("aiInstructions")}
        </h3>
        <div className="text-sm text-purple-300/70 space-y-2">
          <p>1. {t("aiInstruction1")}</p>
          <p>2. {t("aiInstruction2")}</p>
          <p>3. {t("aiInstruction3")}</p>
          <p>4. {t("aiInstruction4")}</p>
        </div>
      </section>
    </div>
  );
}
