import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { AdminConfigClient } from "@/components/admin/config/AdminConfigClient";
import { getSiteTheme, getSiteThemeMode } from "@/app/actions/theme";
import { getCachedSiteTitle } from "@/lib/config";
import { parseSensitiveWords } from "@/lib/sensitive-words";
import type { ThemeId, ThemeMode } from "@/themes/types";

export async function generateMetadata(): Promise<Metadata> {
  const [t, siteTitle] = await Promise.all([
    getTranslations("admin"),
    getCachedSiteTitle(),
  ]);
  return { title: `${t("systemConfig")} | ${siteTitle}` };
}

export default async function AdminConfigPage() {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(
      inArray(systemConfig.key, [
        "site_title",
        "site_favicon",
        "site_icp",
        "site_icp_url",
        "sensitive_words",
        "sensitive_words_enabled",
      ])
    );
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const [siteTheme, siteMode] = await Promise.all([getSiteTheme(), getSiteThemeMode()]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <AdminConfigClient
        initialTitle={cfg.site_title ?? ""}
        initialIcp={cfg.site_icp ?? ""}
        initialIcpUrl={cfg.site_icp_url ?? ""}
        initialFavicon={cfg.site_favicon ?? ""}
        initialSensitiveEnabled={cfg.sensitive_words_enabled !== "0"}
        initialCustomWords={parseSensitiveWords(cfg.sensitive_words ?? "")}
        currentTheme={siteTheme as ThemeId}
        currentMode={siteMode as ThemeMode}
      />
    </div>
  );
}
