import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminAiToggle } from "@/components/admin/ai/AdminAiToggle";
import { AdminProviderManager } from "@/components/admin/ai/AdminProviderManager";
import { AdminBotPresets } from "@/components/admin/ai/AdminBotPresets";
import { getBotPresetsAction } from "@/app/actions/bot-presets";

export default async function AdminAiFeaturesPage() {
  const t = await getTranslations("admin");

  // Load AI Switch state
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";

  // Load Presets
  const presets = await getBotPresetsAction();

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display">{t("aiFeatures")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("aiConfigDesc")}</p>
      </div>

      {/* Global AI toggle */}
      <AdminAiToggle initialEnabled={aiEnabled} />

      {/* Shared providers */}
      <AdminProviderManager />

      {/* Bot presets */}
      <AdminBotPresets presets={presets} />
    </div>
  );
}
