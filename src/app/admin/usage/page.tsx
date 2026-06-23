import { db } from "@/db";
import { aiTokenUsages, users, aiProviders } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { TokenUsageDashboard } from "@/components/admin/usage/TokenUsageDashboard";

export default async function AdminUsagePage() {
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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <TokenUsageDashboard usages={usages} />
    </div>
  );
}
