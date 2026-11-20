import "server-only";
import { db } from "@/db";
import { systemConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Single source of truth for the global AI feature switch (`ai_enabled`). */
export async function isAiGloballyEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, "ai_enabled"));
  return row?.value === "true";
}
