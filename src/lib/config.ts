import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/**
 * Get the site title from system config with caching.
 * Revalidates when the 'system_config' tag is invalidated.
 */
export const getCachedSiteTitle = unstable_cache(
  async () => {
    const [titleConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_title"));
    return titleConfig?.value || "Simple TRPG Chat";
  },
  ["site_title_cache"],
  { tags: ["system_config"] }
);

/**
 * Get the site favicon (base64 data URL) from system config with caching.
 * Returns empty string when not set — layout.tsx falls back to static favicon.ico.
 */
export const getCachedSiteFavicon = unstable_cache(
  async () => {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_favicon"));
    return row?.value ?? "";
  },
  ["site_favicon_cache"],
  { tags: ["system_config"] }
);

/**
 * Get the ICP filing number (中国大陆备案号) from system config with caching.
 * Empty string means no filing configured — the login footer hides it.
 */
export const getCachedSiteIcp = unstable_cache(
  async () => {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_icp"));
    return row?.value?.trim() ?? "";
  },
  ["site_icp_cache"],
  { tags: ["system_config"] }
);

/**
 * Get the ICP filing link. Falls back to the official MIIT portal when unset.
 */
export const getCachedSiteIcpUrl = unstable_cache(
  async () => {
    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "site_icp_url"));
    return row?.value?.trim() || "https://beian.miit.gov.cn/";
  },
  ["site_icp_url_cache"],
  { tags: ["system_config"] }
);
