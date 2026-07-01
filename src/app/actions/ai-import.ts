"use server";

import { db } from "@/db";
import { aiProviders, inventoryItems, inventoryDistributions, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { recordTokenUsage } from "@/lib/ai_usage";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";
import { emitToUser } from "@/lib/events";
import { validateApiEndpoint } from "@/lib/url-guard";

type Translator = Awaited<ReturnType<typeof getTranslations>>;
type Provider = typeof aiProviders.$inferSelect;

// LLM output format for analyzed items
interface AnalyzedItem {
  type: "clue" | "info" | "character" | "item";
  title: string;
  content: string | Record<string, string>;
}

// Registry of in-flight analysis jobs so they can be cancelled.
// Persisted on globalThis per the project's singleton convention (see src/lib/events.ts).
declare global {
  var __aiImportJobs: Map<string, AbortController> | undefined;
}
const importJobs = globalThis.__aiImportJobs || new Map<string, AbortController>();
globalThis.__aiImportJobs = importJobs;

/**
 * A1: Start an async background analysis of raw text using the Host's AI config.
 *
 * Validation (auth, provider resolution, quota, key decryption) runs synchronously
 * and returns immediately. The long-running LLM call is launched as a detached
 * background task so it never blocks the Next.js Server Action queue (which would
 * freeze the rest of the UI). The result is delivered to the requesting user over
 * the existing SSE channel as an `ai_import_result` event.
 */
export async function startTextImportAnalysisAction(
  roomId: number,
  rawText: string,
  providerId?: number
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  const t = await getTranslations("aiImport");
  try {
    const { userId } = await checkRoomAccess(roomId, true);

    // Resolve the AI provider: use the explicitly selected one if given (and the
    // user is authorized to use it), otherwise fall back to the first available.
    let provider: Provider | undefined;
    if (providerId) {
      [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, providerId));
      if (!provider || (provider.ownerId !== userId && !provider.isShared)) {
        return { success: false, error: t("errNoProvider") };
      }
    } else {
      // Get first available AI provider (own or shared)
      [provider] = await db.select().from(aiProviders).where(
        or(eq(aiProviders.ownerId, userId), eq(aiProviders.isShared, true))
      ).orderBy(aiProviders.id);
    }
    if (!provider) {
      return { success: false, error: t("errNoProvider") };
    }

    // Verify quota for shared provider
    if (provider.isShared) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user && user.role !== "admin" && Number(user.aiPoints || 0) <= 0) {
        return { success: false, error: t("errNoQuota") };
      }
    }

    let apiKey: string;
    try {
      apiKey = decrypt(provider.apiKeyEncrypted);
    } catch {
      return { success: false, error: "Provider API key cannot be decrypted — please delete and re-create this provider." };
    }

    // Register the job and launch the analysis without awaiting it.
    const jobId = crypto.randomUUID();
    const controller = new AbortController();
    importJobs.set(jobId, controller);

    void runAnalysis(roomId, userId, rawText, provider, apiKey, jobId, controller, t)
      .finally(() => importJobs.delete(jobId));

    return { success: true, jobId };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : t("errRequestFailGeneral") };
  }
}

/**
 * Cancel an in-flight analysis job. Best-effort: aborts the outbound LLM fetch
 * if the job is still running on this worker.
 */
export async function cancelTextImportAnalysisAction(
  roomId: number,
  jobId: string
): Promise<{ success: boolean }> {
  try {
    await checkRoomAccess(roomId, true);
  } catch {
    return { success: false };
  }
  const controller = importJobs.get(jobId);
  if (controller) {
    controller.abort();
    importJobs.delete(jobId);
  }
  return { success: true };
}

/**
 * Background worker: calls the LLM, parses the result and emits it to the
 * requesting user over SSE. Never throws — all outcomes are reported via emit.
 */
async function runAnalysis(
  roomId: number,
  userId: number,
  rawText: string,
  provider: Provider,
  apiKey: string,
  jobId: string,
  controller: AbortController,
  t: Translator
): Promise<void> {
  const emit = (data: Record<string, unknown>) =>
    emitToUser(roomId, userId, { type: "ai_import_result", jobId, ...data });

  try {
    const endpoint = provider.apiEndpoint;

    const endpointCheck = await validateApiEndpoint(endpoint);
    if (!endpointCheck.valid) {
      emit({ success: false, error: t("errRequestFailed", { status: 0, error: endpointCheck.error || "" }) });
      return;
    }

    const systemPrompt = `你是一个 TRPG 内容结构化助手。分析用户输入的文本，将其拆解为结构化的物品/线索条目。

输出格式（纯 JSON 数组，不要 markdown 代码块）：
[
  { "type": "clue", "title": "线索标题", "content": "线索详细内容" },
  { "type": "info", "title": "信息标题", "content": "信息详细内容" },
  { "type": "character", "title": "角色名", "content": { "basicInfo": "基本信息", "detail": "详细描述" } },
  { "type": "item", "title": "物品名", "content": { "appearance": "外形描述", "extra": "补充信息" } }
]

规则：
- type 只能是 "clue", "info", "character", "item"
- 每个条目必须有 title 和 content
- content 可以是字符串或对象
- 只输出相关的内容，不要编造`;

    // Abort on either user cancellation or a 60s timeout — keeps a hung provider
    // from leaking a request forever (mirrors the timeout in src/app/actions/ai.ts).
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText.slice(0, 5000) },
        ],
        temperature: 0.3,
      }),
      signal,
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      emit({ success: false, error: t("errRequestFailed", { status: response.status, error: err.slice(0, 200) }) });
      return;
    }

    const data = await response.json();

    // Record token usage
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const cachedInputTokens = usage.prompt_tokens_details?.cached_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    await recordTokenUsage(userId, provider.id, inputTokens, cachedInputTokens, outputTokens);

    const raw = data.choices?.[0]?.message?.content || "";

    // Try to parse JSON from response
    let items: AnalyzedItem[];
    try {
      items = JSON.parse(raw);
    } catch {
      // Try to extract JSON array from markdown code block
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          items = JSON.parse(match[1]);
        } catch {
          emit({ success: false, error: t("errCannotParse") });
          return;
        }
      } else {
        emit({ success: false, error: t("errCannotParse") });
        return;
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      emit({ success: false, error: t("errNoContent") });
      return;
    }

    // Validate and filter
    const validTypes = ["clue", "info", "character", "item"];
    const validItems = items.filter(
      item => validTypes.includes(item.type) && item.title && item.content
    );

    if (validItems.length === 0) {
      emit({ success: false, error: t("errNoValidItems") });
      return;
    }

    emit({ success: true, items: validItems });
  } catch (e: unknown) {
    // Distinguish user cancellation / timeout from genuine failures.
    const err = e as { name?: string; message?: string } | null;
    if (err?.name === "TimeoutError") {
      emit({ success: false, error: t("errTimeout") });
    } else if (err?.name === "AbortError") {
      emit({ success: false, error: t("errCancelled"), cancelled: true });
    } else {
      emit({ success: false, error: err?.message || t("errRequestFailGeneral") });
    }
  }
}

/**
 * A3: Batch import analyzed items into inventory_items with proper type handling.
 * Clues are now stored as inventoryItems with type='clue' in the unified system.
 */
export async function batchImportItemsAction(
  roomId: number,
  items: AnalyzedItem[]
): Promise<{ success: boolean; imported: number; error?: string }> {
  const t = await getTranslations("aiImport");
  try {
    const { userId } = await checkRoomAccess(roomId, true);
    let imported = 0;

    await db.transaction(async (tx) => {
      for (const item of items) {
        // Insert all items (including clues) into inventoryItems
        const [newItem] = await tx.insert(inventoryItems).values({
          roomId,
          creatorId: userId,
          type: item.type as "clue" | "info" | "character" | "item",
          title: item.title,
          contentJson: typeof item.content === "string"
            ? JSON.stringify({ text: item.content })
            : JSON.stringify(item.content),
        }).returning();

        // For clues, create a public visibility record (toUserId=null)
        if (item.type === "clue") {
          await tx.insert(inventoryDistributions).values({
            roomId,
            itemId: newItem.id,
            fromUserId: userId,
            toUserId: null, // public visibility
            action: "created",
          });
        }

        imported++;
      }
    });

    revalidatePath(`/rooms/${roomId}`);
    return { success: true, imported };
  } catch (err: unknown) {
    return { success: false, imported: 0, error: err instanceof Error ? err.message : t("errImportFailed") };
  }
}
