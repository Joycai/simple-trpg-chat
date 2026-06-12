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
