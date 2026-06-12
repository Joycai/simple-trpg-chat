import { db } from "@/db";
import { aiTokenUsages, users, aiProviders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { TokenUsageDashboard } from "@/components/TokenUsageDashboard";

export default async function AdminUsagePage() {
  const t = await getTranslations("tokenUsage");

  const usages = await db
    .select({
      id: aiTokenUsages.id,
      day: aiTokenUsages.day,
      inputTokens: aiTokenUsages.inputTokens,
      cachedInputTokens: aiTokenUsages.cachedInputTokens,
      outputTokens: aiTokenUsages.outputTokens,
      userName: users.displayName,
      username: users.username,
      providerName: aiProviders.name,
      model: aiProviders.model,
      isShared: aiProviders.isShared,
    })
    .from(aiTokenUsages)
    .innerJoin(users, eq(aiTokenUsages.userId, users.id))
    .innerJoin(aiProviders, eq(aiTokenUsages.providerId, aiProviders.id))
    .where(eq(aiProviders.isShared, true))
    .orderBy(desc(aiTokenUsages.day), desc(aiTokenUsages.id));

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
        <p className="text-sm text-text-muted mt-1">{t("description")}</p>
      </div>
      <TokenUsageDashboard usages={usages} />
    </div>
  );
}
