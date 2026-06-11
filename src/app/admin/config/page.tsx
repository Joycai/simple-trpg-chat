import { db, currentDialect } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { AdminAiToggle } from "@/components/AdminAiToggle";
import { AdminProviderManager } from "@/components/AdminProviderManager";
import { SiteThemeSelector } from "@/components/SiteThemeSelector";
import { AdminSensitiveWords } from "@/components/AdminSensitiveWords";
import { getSiteTheme } from "@/app/actions/theme";
import type { ThemeId } from "@/themes/types";
import { Database, HardDrive } from "lucide-react";

export default async function AdminConfigPage() {
  const t = await getTranslations("admin");
  const [aiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  const aiEnabled = aiConfig?.value === "true";
  const [wordsConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "sensitive_words"));
  const sensitiveWords = wordsConfig?.value || "";
  const dbType = currentDialect;
  const siteTheme = await getSiteTheme();

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-text">{t("systemConfig")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("systemConfigDesc")}</p>
      </div>

      <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
        <h3 className="font-bold text-text mb-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-accent" />
          {t("aiToggle")}
        </h3>
        <AdminAiToggle initialEnabled={aiEnabled} />
      </section>

      <section className="bg-surface p-5 rounded-xl border border-border shadow-lg">
        <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-primary" />
          {t("dbConfig")}
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">{t("dbType")}</span>
          <span className="text-sm font-bold text-text inline-flex items-center gap-1">
            {dbType === "postgresql" ? <><Database className="w-4 h-4" /> PostgreSQL</> : <><HardDrive className="w-4 h-4" /> SQLite</>}
          </span>
        </div>
        <p className="text-[10px] text-text-dim mt-2">{t("dbConfigHint")}</p>
      </section>

      <SiteThemeSelector currentTheme={siteTheme as ThemeId} />

      <AdminSensitiveWords initialWords={sensitiveWords} />

      <AdminProviderManager />

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
