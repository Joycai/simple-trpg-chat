"use server";

import { db } from "@/db";
import { aiProviders, inventoryItems, inventoryDistributions, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { auth } from "@/auth";
import { decrypt } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { recordTokenUsage } from "@/lib/ai_usage";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";

// LLM output format for analyzed items
interface AnalyzedItem {
  type: "clue" | "info" | "character" | "item";
  title: string;
  content: string | Record<string, string>;
}

/**
 * A1: Analyze raw text using Host's AI config and return structured items.
 * Only Host with AI configured can use this.
 */
export async function analyzeTextForImportAction(
  roomId: number,
  rawText: string
): Promise<{ success: boolean; items?: AnalyzedItem[]; error?: string }> {
  const t = await getTranslations("aiImport");
  try {
    const { userId } = await checkRoomAccess(roomId, true);

    // Get first available AI provider (own or shared)
    const [provider] = await db.select().from(aiProviders).where(
      or(eq(aiProviders.ownerId, userId), eq(aiProviders.isShared, true))
    ).orderBy(aiProviders.id);
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

    const apiKey = decrypt(provider.apiKeyEncrypted);
    const endpoint = provider.apiEndpoint;

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
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return { success: false, error: t("errRequestFailed", { status: response.status, error: err.slice(0, 200) }) };
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
          return { success: false, error: t("errCannotParse") };
        }
      } else {
        return { success: false, error: t("errCannotParse") };
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: t("errNoContent") };
    }

    // Validate and filter
    const validTypes = ["clue", "info", "character", "item"];
    const validItems = items.filter(
      item => validTypes.includes(item.type) && item.title && item.content
    );

    if (validItems.length === 0) {
      return { success: false, error: t("errNoValidItems") };
    }

    return { success: true, items: validItems };
  } catch (e: any) {
    return { success: false, error: e.message || t("errRequestFailGeneral") };
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
        const [newItem] = await (tx.insert as any)(inventoryItems).values({
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
  } catch (err: any) {
    return { success: false, imported: 0, error: err.message || t("errImportFailed") };
  }
}
