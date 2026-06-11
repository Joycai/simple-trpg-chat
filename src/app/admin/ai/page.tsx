import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminAiToggle } from "@/components/AdminAiToggle";
import { AdminProviderManager } from "@/components/AdminProviderManager";
import { AdminBotPresets } from "@/components/AdminBotPresets";
import { getBotPresetsAction } from "@/app/actions/bot-presets";

export default async function AdminAiFeaturesPage() {
  const t = await getTranslations("admin");

  // Load AI Switch state
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";

  // Load Presets
  const presets = await getBotPresetsAction();

  return (
    <div className="p-6 flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-text">{t("aiFeatures")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("aiConfigDesc")}</p>
      </div>

      {/* AI Toggle */}
      <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
        <h3 className="font-bold text-text mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-accent" />
          {t("aiToggle")}
        </h3>
        <AdminAiToggle initialEnabled={aiEnabled} />
      </section>

      {/* Bot Presets Management */}
      <AdminBotPresets presets={presets as any[]} />

      {/* AI Provider Management */}
      <AdminProviderManager />

      {/* Instructions */}
      <section className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
        <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          {t("aiInstructions")}
        </h3>
        <div className="text-sm text-text-muted space-y-2">
          <p>1. {t("aiInstruction1")}</p>
          <p>2. {t("aiInstruction2")}</p>
          <p>3. {t("aiInstruction3")}</p>
          <p>4. {t("aiInstruction4")}</p>
        </div>
      </section>
    </div>
  );
}
