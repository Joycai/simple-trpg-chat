import { db, sqlNow } from "@/db";
import { recordTokenUsage } from "@/lib/ai_usage";
import { users, messages, inventoryDistributions, inventoryItems, rooms, aiProviders, roomMembers, roomSkills, clueCards, clueVisibility, systemConfig } from "@/db/schema";
import { eq, and, asc, desc, gt, sql, or, isNull } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { broadcastToRoom, emitToUser } from "@/lib/events";
import { dispatchMessage } from "@/lib/messaging/router";
import { rollDice } from "@/lib/utils";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { z } from "zod";
import { computeCocDerived, type CharacterData } from "@/lib/character-types";
import { getRuleForRoom, listRuleIds } from "@/lib/rules";

// Zod Schema for Bot Config Validation (R17)
const BotConfigSchema = z.object({
  roomId: z.number().optional(),
  systemPrompt: z.string().optional().default("You are an AI assistant in a TRPG session."),
  historicalSummary: z.string().optional().default(""),
  model: z.string().optional().default("gpt-4o"),
  activation: z.string().optional().default("mention"),
  enableTools: z.array(z.string()).optional().default(["send_message", "roll_dice"]),
  lastSummarizedMsgId: z.number().optional().default(0),
  providerId: z.number().optional(),
});

type BotConfig = z.infer<typeof BotConfigSchema>;

function parseBotConfig(jsonStr: string | null | undefined): BotConfig {
  if (!jsonStr) {
    return BotConfigSchema.parse({});
  }
  try {
    const rawObj = JSON.parse(jsonStr);
    return BotConfigSchema.parse(rawObj);
  } catch (err) {
    console.error("[BotConfig] Failed to parse or validate config, falling back to defaults:", err);
    return BotConfigSchema.parse({});
  }
}

// Fetch helper with exponential backoff and retries (R9)
async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3, initialDelay = 1000): Promise<Response> {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || attempt === maxRetries) {
        return response;
      }
      console.warn(`[AI API] Attempt ${attempt} failed with status ${response.status}. Retrying in ${delay}ms...`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`[AI API] Attempt ${attempt} encountered error: ${error}. Retrying in ${delay}ms...`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
  }
  throw new Error("Failed after maximum retries");
}

/**
 * buildAgentContext
 * Constructs the LLM context for a specific Bot.
 */
/**
 * Build the system + history context array handed to the LLM. The room is
 * passed in so the active rule module can contribute its prompt fragment
 * (crit/fumble rules, sheet-shape hints, etc.) instead of this function
 * branching on rule ids.
 */
export async function buildAgentContext(
  botUser: { botConfigJson?: string | null },
  room: { ruleTemplate?: string | null },
  roomId: number,
  botUserId: number,
  preParsedConfig?: BotConfig
) {
  const config = preParsedConfig || parseBotConfig(botUser.botConfigJson);
  const sysPrompt = config.systemPrompt;
  const summary = config.historicalSummary || "";

  // Parallelize database queries for inventory distributions and messages history
  const [distributions, history] = await Promise.all([
    db.query.inventoryDistributions.findMany({
      where: and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, botUserId)
      ),
      with: { item: true },
      limit: 100
    }),
    db.select().from(messages)
      .where(
        and(
          eq(messages.roomId, roomId),
          gt(messages.id, config.lastSummarizedMsgId),
          sql`(${messages.isPrivate} = FALSE OR ${messages.userId} = ${botUserId} OR ${messages.targetUserId} = ${botUserId})`
        )
      )
      .orderBy(desc(messages.id))
      .limit(50) // Safety limit
  ]);

  const knowledgeBase = distributions.map(d => ({
    id: d.itemId,
    title: d.item.title,
    type: d.item.type
  }));

  const sortedHistory = [...history].reverse();

  // The rule module owns its own LLM-facing prompt (crit/fumble rules etc.),
  // so adding a new ruleset doesn't require touching this builder.
  const rule = getRuleForRoom(room || {});
  const rulesExplanation = rule.describeForAI().rulesPrompt;

  const context: { role: string; name?: string; content: string; tool_calls?: unknown; tool_call_id?: string }[] = [
    {
      role: "system",
      content: `${sysPrompt}\n\n[Room Rules]:\n- Rule: ${rule.id}\n- Rule Note: ${rulesExplanation}\n\n[Your Current Knowledge/Items]:\n${JSON.stringify(knowledgeBase)}\n\n[Historical Summary]:\n${summary || "No history yet."}\n\nYou can use 'inspect_item(itemId)' to see details of any item you possess.`
    }
  ];

  for (const msg of sortedHistory) {
    if (msg.userId === botUserId) {
      const prefix = msg.isPrivate ? "[私聊] " : "";
      context.push({ role: "assistant", content: `${prefix}${msg.content}` });
    } else if (["text", "dice", "clue", "system", "check_request"].includes(msg.type)) {
      const prefix = msg.isPrivate ? "[私聊] " : "";
      context.push({ role: "user", content: `[${msg.nickname}]: ${prefix}${msg.content}` });
    }
  }

  return { context, model: config.model || "gpt-4o" };
}

const agentCooldowns = new Map<number, number>();
const AGENT_COOLDOWN_MS = 3000;

/**
 * runAgent
 * Orchestrates the LLM call and Tool execution.
 */
export async function runAgent(
  botUserId: number,
  roomId: number,
  triggeringInfo?: { triggeringUserId: number; isPrivate: boolean }
) {
  const now = Date.now();
  // Prune stale cooldown entries to prevent the map from growing indefinitely
  for (const [id, ts] of agentCooldowns) {
    if (now - ts > AGENT_COOLDOWN_MS) agentCooldowns.delete(id);
  }
  const lastRun = agentCooldowns.get(botUserId) || 0;
  if (now - lastRun < AGENT_COOLDOWN_MS) {
    console.log(`[RateLimit] Bot ${botUserId} skipped due to 3s cooldown`);
    return;
  }
  agentCooldowns.set(botUserId, now);

  // Retrieve room, botUser, and roomMember records in parallel
  const [roomResult, botUserResult, memberResult] = await Promise.all([
    db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1),
    db.select().from(users).where(eq(users.id, botUserId)).limit(1),
    db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId))).limit(1)
  ]);

  const room = roomResult[0];
  const botUser = botUserResult[0];
  const member = memberResult[0];

  if (!room || !botUser) return;

  // 1. Verify global AI switch
  const [globalAiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  if (globalAiConfig?.value !== "true") {
    console.log(`[runAgent] Bot ${botUserId} skipped because AI features are globally disabled`);
    return;
  }

  const botCfg = parseBotConfig(botUser.botConfigJson);

  if (!botCfg.providerId) {
    console.error(`[runAgent] Bot ${botUserId} has no AI Provider configured`);
    return;
  }

  const [aiConfig] = await db.select().from(aiProviders).where(eq(aiProviders.id, botCfg.providerId));
  if (!aiConfig) {
    console.error(`[runAgent] Configured AI Provider (ID: ${botCfg.providerId}) not found for bot ${botUserId}`);
    return;
  }

  // 2. Verify that provider is owned by the room's host or is shared globally
  if (aiConfig.ownerId !== room.hostId && !aiConfig.isShared) {
    console.error(`[runAgent] AI Provider (ID: ${botCfg.providerId}) is neither owned by room host ${room.hostId} nor shared globally.`);
    return;
  }

  // 3. Verify quota for shared provider
  if (aiConfig.isShared) {
    const [hostUser] = await db.select().from(users).where(eq(users.id, room.hostId)).limit(1);
    if (hostUser && hostUser.role !== "admin" && Number(hostUser.aiPoints || 0) <= 0) {
      console.log(`[runAgent] Host ${room.hostId} quota exhausted for shared provider. Skipping bot run.`);
      return;
    }
  }

  let apiKey: string;
  try {
    apiKey = decrypt(aiConfig.apiKeyEncrypted);
  } catch {
    console.error(`[runAgent] Provider API key cannot be decrypted (key mismatch) — delete and re-create the provider.`);
    return;
  }
  const endpoint = aiConfig.apiEndpoint;

  const { context, model } = await buildAgentContext(botUser, room, roomId, botUserId, botCfg);
  const enabledTools: string[] = botCfg.enableTools || ["roll_dice"];


  const allTools = [
    {
      type: "function",
      function: {
        name: "roll_dice",
        description: "Roll dice for the TRPG game. Limit count: 1-20, faces: 1-1000.",
        parameters: {
          type: "object",
          properties: {
            faces: { type: "integer", minimum: 1, maximum: 1000 },
            count: { type: "integer", minimum: 1, maximum: 20 },
            isPrivate: { type: "boolean" }
          },
          required: ["faces", "count"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_image",
        description: `Show an image in the chat. Provide an image URL — either an internal room image path (e.g. /api/rooms/${roomId}/images/...) or a public https:// image URL. Use this to illustrate a scene, handout, or object.`,
        parameters: {
          type: "object",
          properties: {
            imageUrl: { type: "string", description: "An internal room image path for this room, or a public https:// image URL" },
            isPrivate: { type: "boolean" }
          },
          required: ["imageUrl"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "inspect_item",
        description: "Read details of an item in inventory",
        parameters: {
          type: "object",
          properties: {
            itemId: { type: "integer" }
          },
          required: ["itemId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_history",
        description: "Search chat history in the current room by keyword. Use this when you need to recall past events, plot points, or information mentioned earlier in the conversation that is beyond your sliding window.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keyword or phrase to search for" },
            limit: { type: "integer", description: "Max results to return (default 10, max 20)" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "my_inventory",
        description: "List all items in your inventory. Use this to check what equipment, documents, or items you currently possess.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "my_clues",
        description: "List all clue cards that have been revealed to you in this room.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "my_character",
        description: "Check your own character sheet including attributes, HP/SAN/MP, skills, and status.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "set_character_card",
        description: "Set or update your own character sheet attributes, skills, and background story.",
        parameters: {
          type: "object",
          properties: {
            ruleTemplate: {
              type: "string",
              // Enum sourced from the rule registry so any newly registered
              // rule is advertised to the LLM without a manual edit here.
              enum: [...listRuleIds()],
              description: "The rule template to use. 'coc7th' is for Call of Cthulhu 7th edition, 'basic' is for a generic TRPG character card."
            },
            name: { "type": "string", "description": "The character's name" },
            age: { "type": "integer", "description": "The character's age" },
            occupation: { "type": "string", "description": "The character's occupation" },
            bio: { "type": "string", "description": "The character's biography or backstory" },
            cocAttributes: {
              type: "object",
              description: "COC 7th attributes (required/used only if ruleTemplate is 'coc7th'). Values should typically be between 15 and 99.",
              properties: {
                str: { "type": "integer", "description": "Strength" },
                con: { "type": "integer", "description": "Constitution" },
                siz: { "type": "integer", "description": "Size" },
                dex: { "type": "integer", "description": "Dexterity" },
                app: { "type": "integer", "description": "Appearance" },
                int: { "type": "integer", "description": "Intelligence" },
                pow: { "type": "integer", "description": "Power" },
                edu: { "type": "integer", "description": "Education" },
                luck: { "type": "integer", "description": "Luck" }
              }
            },
            customAttributes: {
              type: "array",
              description: "Generic custom attributes/stats for non-COC systems or extensions.",
              items: {
                type: "object",
                properties: {
                  name: { "type": "string", "description": "Attribute name, e.g. 'Sanity', 'Mana', 'Strength'" },
                  value: { "type": "integer", "description": "Current value" },
                  max: { "type": "integer", "description": "Optional maximum value" }
                },
                required: ["name", "value"]
              }
            },
            skills: {
              type: "array",
              description: "Skills list to add or update.",
              items: {
                type: "object",
                properties: {
                  name: { "type": "string", "description": "Skill name, e.g. 'Spot Hidden' or 'Library Use'" },
                  value: { "type": "integer", "description": "Skill level/percentage (e.g. 50)" }
                },
                required: ["name", "value"]
              }
            }
          }
        }
      }
    }
  ];
  // Filter to only the tools enabled for this bot. Note: free-text replies are
  // broadcast directly from the model's message content (R3), so there is no
  // "send_message" tool — a bot can always talk without one being enabled.
  const tools = allTools.filter(t => enabledTools.includes(t.function.name));

  const currentContext: { role: string; name?: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; function_call?: unknown }[] = [...context];
  let iterations = 0;

  const botNickname = member?.nickname || botUser?.displayName || "AI";

  // Check if the triggering context was private and identify the target user
  let replyIsPrivate = false;
  let targetUserId: number | null = null;

  if (triggeringInfo) {
    replyIsPrivate = triggeringInfo.isPrivate;
    targetUserId = triggeringInfo.triggeringUserId;
  } else {
    try {
      // Limit to public messages or private messages involving the bot to scan history
      const history = await db.select().from(messages)
        .where(
          and(
            eq(messages.roomId, roomId),
            sql`(${messages.isPrivate} = FALSE OR ${messages.userId} = ${botUserId} OR ${messages.targetUserId} = ${botUserId})`
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(20);
      const sortedHistory = [...history].reverse();

      for (let i = sortedHistory.length - 1; i >= 0; i--) {
        const msg = sortedHistory[i];
        if (msg.userId !== botUserId) {
          if (msg.isPrivate && msg.targetUserId === botUserId) {
            replyIsPrivate = true;
            targetUserId = msg.userId;
          }
          break;
        }
      }

      if (!targetUserId) {
        for (let i = sortedHistory.length - 1; i >= 0; i--) {
          const msg = sortedHistory[i];
          if (msg.isPrivate) {
            if (msg.userId === botUserId && msg.targetUserId) {
              targetUserId = msg.targetUserId;
              break;
            } else if (msg.targetUserId === botUserId) {
              targetUserId = msg.userId;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("[runAgent] Error determining triggering context privacy:", err);
    }
  }

  if (!targetUserId) {
    targetUserId = room.hostId;
  }

  const typingStartEvent = {
    type: "typing",
    botUserId,
    nickname: botNickname,
    typing: true,
    isPrivate: replyIsPrivate,
    targetUserId: targetUserId,
    userId: botUserId
  };
  // Use targeted emit for private replies so other room members don't see the typing indicator
  if (replyIsPrivate && targetUserId) {
    emitToUser(roomId, targetUserId, typingStartEvent);
    if (targetUserId !== room.hostId) emitToUser(roomId, room.hostId, typingStartEvent);
  } else {
    broadcastToRoom(roomId, typingStartEvent);
  }

  // Declare accumulated token counters
  let accumulatedInputTokens = 0;
  let accumulatedCachedInputTokens = 0;
  let accumulatedOutputTokens = 0;

  try {
    // 2. Fetch the LLM completion
    while (iterations < 5) {
      iterations++;

      let assistantMessage;
      try {
        const bodyPayload = {
          model,
          messages: currentContext,
          ...(tools.length > 0 ? { tools } : {})
        };

        const response = await fetchWithBackoff(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`AI API error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        
        // Record token usage (accumulated and saved in the finally block)
        const usage = data.usage || {};
        accumulatedInputTokens += usage.prompt_tokens || 0;
        accumulatedCachedInputTokens += usage.prompt_tokens_details?.cached_tokens || 0;
        accumulatedOutputTokens += usage.completion_tokens || 0;

        assistantMessage = data.choices[0].message;
      } catch (err: unknown) {
        console.error(`[runAgent] completion error:`, err);
        const content = `🤖 (${botNickname}) encountered an error connecting to AI: ${err instanceof Error ? err.message : String(err)}`;
        await dispatchMessage({
          roomId,
          actorUserId: botUserId,
          nickname: botNickname,
          type: "text",
          audience: replyIsPrivate ? "dm" : "everyone",
          targetUserId: replyIsPrivate ? targetUserId : null,
          content: replyIsPrivate ? `🔒 ${content}` : content,
        });
        break;
      }

      // Add assistant response to context
      currentContext.push(assistantMessage);

      // If there is message text, broadcast it (R3) (filtered with sensitive words check)
      if (assistantMessage.content) {
        let textToSend = assistantMessage.content;
        const matchedWord = await checkSensitiveWords(textToSend);
        if (matchedWord) {
          console.warn(`[AI Sensitive Words] Bot ${botUserId} output matched sensitive word: ${matchedWord}. Redacting...`);
          textToSend = "🤖 (Output blocked due to sensitive content filter)";
        }
        await dispatchMessage({
          roomId,
          actorUserId: botUserId,
          nickname: botNickname,
          type: "text",
          audience: replyIsPrivate ? "dm" : "everyone",
          targetUserId: replyIsPrivate ? targetUserId : null,
          content: textToSend,
        });
      }

      // If no tool calls, we are finished
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      const toolCallResults: { role: string; name?: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; function_call?: unknown }[] = [];
      for (const toolCall of assistantMessage.tool_calls) {
        // Execute tool calls sequentially to avoid DB race conditions on concurrent writes
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        let result;

        try {
          if (functionName === "roll_dice") {
            const count = Math.max(1, Math.min(args.count || 1, 20));
            const faces = Math.max(1, Math.min(args.faces || 6, 1000));
            const { results: rollResults, sum } = rollDice(faces, count);
            const detail = JSON.stringify({ dice: `d${faces}`, count, results: rollResults, sum, isBot: true });
            const content = `🤖 (${botNickname}) 🎲 ${count}d${faces}: [${rollResults.join(", ")}] = ${sum}`;
            await dispatchMessage({
              roomId,
              actorUserId: botUserId,
              nickname: botNickname,
              type: "dice",
              audience: args.isPrivate ? "dm" : "everyone",
              targetUserId: args.isPrivate ? targetUserId : null,
              content: args.isPrivate ? `🔒 ${content}` : content,
              diceDetail: detail,
            });

            // Crit/fumble bounds belong to the rule. The COC module recognizes
            // them on raw 1d100 rolls; basic adds a "CoC-cultural" hint that
            // helps the LLM react idiomatically. Other rules contribute no
            // evaluation here — they'll plug in via a future
            // `rule.naturalGrade(roll, faces)` hook when needed.
            const rollRule = getRuleForRoom(room || {});

            let evaluation = undefined;
            if (faces === 100 && count === 1) {
              if (rollRule.id === "coc7th") {
                if (sum <= 5) {
                  evaluation = "Critical Success (大成功)";
                } else if (sum >= 96) {
                  evaluation = "Fumble (大失败)";
                }
              } else if (rollRule.id === "basic") {
                if (sum === 100) {
                  evaluation = "Fumble (大失败) in CoC rules (though current room uses basic rules)";
                } else if (sum === 1) {
                  evaluation = "Critical Success (大成功) in CoC rules (though current room uses basic rules)";
                }
              }
            }

            result = {
              success: true,
              results: rollResults,
              sum,
              ruleTemplate: rollRule.id,
              ...(evaluation ? { evaluation } : {})
            };
          } else if (functionName === "send_image") {
            const imageUrl = String(args.imageUrl || "").trim();
            // Internal images are pinned to THIS room so other members can
            // actually load them (the image route authorizes by the room id in
            // the path). External links are restricted to https:// to avoid
            // mixed-content breakage and to keep the surface narrow.
            const isInternal = new RegExp(`^/api/rooms/${roomId}/images/[A-Za-z0-9._-]+$`).test(imageUrl);
            const isHttps = /^https:\/\/\S+$/i.test(imageUrl) && imageUrl.length <= 2048;
            if (!isInternal && !isHttps) {
              result = { success: false, error: "Invalid image URL. Use an internal image path for this room, or a public https:// URL." };
            } else {
              await dispatchMessage({
                roomId,
                actorUserId: botUserId,
                nickname: botNickname,
                type: "image",
                audience: args.isPrivate ? "dm" : "everyone",
                targetUserId: args.isPrivate ? targetUserId : null,
                content: imageUrl,
              });
              result = { success: true };
            }
          } else if (functionName === "inspect_item") {
            // Validate that the item belongs to this room
            const [item] = await db.select().from(inventoryItems).where(
              and(
                eq(inventoryItems.id, args.itemId),
                eq(inventoryItems.roomId, roomId)
              )
            );
            if (!item) {
              result = { error: "Item not found in this room" };
            } else {
              // Validate that the bot actually possesses this item
              const [possession] = await db.select().from(inventoryDistributions).where(
                and(
                  eq(inventoryDistributions.roomId, roomId),
                  eq(inventoryDistributions.itemId, args.itemId),
                  eq(inventoryDistributions.toUserId, botUserId)
                )
              );
              if (!possession) {
                result = { error: "Unauthorized: You do not possess this item" };
              } else {
                result = { title: item.title, content: JSON.parse(item.contentJson) };
              }
            }
          } else if (functionName === "search_history") {
            const query = args.query as string;

            const safeQuery = query.replace(/[%_\\]/g, '\\$&');

            const limit = Math.min(args.limit || 10, 20);
            // Use SQL LIKE for keyword search on message content
            const results = await db.select({
              id: messages.id,
              nickname: messages.nickname,
              content: messages.content,
              type: messages.type,
              createdAt: messages.createdAt,
            }).from(messages)
              .where(
                and(
                  eq(messages.roomId, roomId),
                  sql`(${messages.isPrivate} = FALSE OR ${messages.userId} = ${botUserId} OR ${messages.targetUserId} = ${botUserId})`,
                  sql`${messages.content} LIKE ${'%' + safeQuery + '%'} ESCAPE '\\'`
                )
              )
              .orderBy(desc(messages.createdAt))
              .limit(limit);
            result = {
              query,
              count: results.length,
              results: results.map(r => ({
                nickname: r.nickname,
                content: r.content.slice(0, 300), // Truncate long messages
                type: r.type,
                time: r.createdAt,
              }))
            };
          } else if (functionName === "my_inventory") {
            const dists = await db.query.inventoryDistributions.findMany({
              where: and(
                eq(inventoryDistributions.roomId, roomId),
                eq(inventoryDistributions.toUserId, botUserId)
              ),
              with: { item: true }
            });
            result = {
              count: dists.length,
              items: dists.map(d => ({
                id: d.itemId,
                title: d.item.title,
                type: d.item.type,
              }))
            };
          } else if (functionName === "my_clues") {
            const clueRows = await db.select({
              id: clueCards.id,
              title: clueCards.title,
              content: clueCards.content,
            }).from(clueCards)
              .innerJoin(clueVisibility, eq(clueCards.id, clueVisibility.clueId))
              .where(
                and(
                  eq(clueCards.roomId, roomId),
                  or(
                    isNull(clueVisibility.userId),
                    eq(clueVisibility.userId, botUserId)
                  )
                )
              );
            result = {
              count: clueRows.length,
              clues: clueRows.map(c => ({
                id: c.id,
                title: c.title,
                content: c.content?.slice(0, 200),
              }))
            };
          } else if (functionName === "my_character") {
            const [memberInfo] = await db.select({
              characterData: roomMembers.characterData,
            }).from(roomMembers)
              .where(and(
                eq(roomMembers.roomId, roomId),
                eq(roomMembers.userId, botUserId)
              ));
            const skills = await db.select({
              skillName: roomSkills.skillName,
              skillValue: roomSkills.skillValue,
            }).from(roomSkills)
              .where(and(
                eq(roomSkills.roomId, roomId),
                eq(roomSkills.userId, botUserId)
              ));
            const charData = memberInfo?.characterData ? JSON.parse(memberInfo.characterData) : null;
            result = {
              hasCharacterSheet: !!charData,
              attributes: charData?.cocAttributes || null,
              derived: charData?.cocDerived || null,
              skills: skills.map(s => ({ name: s.skillName, value: s.skillValue })),
              customAttributes: charData?.customAttributes || [],
            };
          } else if (functionName === "set_character_card") {
            const [memberInfo] = await db.select({
              characterData: roomMembers.characterData,
            }).from(roomMembers)
              .where(and(
                eq(roomMembers.roomId, roomId),
                eq(roomMembers.userId, botUserId)
              ));

            const existing: CharacterData = memberInfo?.characterData
              ? JSON.parse(memberInfo.characterData)
              : { ruleTemplate: args.ruleTemplate || "basic" };

            const merged: CharacterData = {
              ...existing,
              ...(args.ruleTemplate ? { ruleTemplate: args.ruleTemplate } : {}),
              ...(args.name !== undefined ? { name: args.name } : {}),
              ...(args.age !== undefined ? { age: args.age } : {}),
              ...(args.occupation !== undefined ? { occupation: args.occupation } : {}),
              ...(args.bio !== undefined ? { bio: args.bio } : {}),
              ...(args.customAttributes !== undefined ? { customAttributes: args.customAttributes } : {}),
            };

            // The model is not trusted to stay within bounds — clamp numeric
            // inputs so it can't write negative or absurd stats into the sheet.
            const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
              const n = Math.round(Number(v));
              return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
            };

            if (merged.ruleTemplate === "coc7th") {
              if (args.cocAttributes && typeof args.cocAttributes === "object") {
                const base = merged.cocAttributes || { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50, luck: 50 };
                const clamped: Record<string, number> = {};
                for (const [k, v] of Object.entries(args.cocAttributes as Record<string, unknown>)) {
                  clamped[k] = clampInt(v, 0, 99, 50);
                }
                merged.cocAttributes = { ...base, ...clamped };
              }
              if (merged.cocAttributes) {
                merged.cocDerived = computeCocDerived(merged.cocAttributes);
              }
            }

            await db.update(roomMembers)
              .set({ characterData: JSON.stringify(merged) })
              .where(and(
                eq(roomMembers.roomId, roomId),
                eq(roomMembers.userId, botUserId)
              ));

            if (args.skills && Array.isArray(args.skills)) {
              for (const skill of args.skills) {
                if (typeof skill.name === "string" && typeof skill.value === "number") {
                  const skillValue = clampInt(skill.value, 0, 999, 0);
                  await db.insert(roomSkills).values({
                    roomId,
                    userId: botUserId,
                    skillName: skill.name.slice(0, 64),
                    skillValue,
                  }).onConflictDoUpdate({
                    target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
                    set: { skillValue, updatedAt: sqlNow() },
                  });
                }
              }
            }

            result = { success: true };
          }
        } catch (e: unknown) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }

        toolCallResults.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }

      currentContext.push(...toolCallResults);
    }
  } finally {
    if (accumulatedInputTokens > 0 || accumulatedOutputTokens > 0) {
      recordTokenUsage(room.hostId, aiConfig.id, accumulatedInputTokens, accumulatedCachedInputTokens, accumulatedOutputTokens)
        .catch(err => console.error("[runAgent] Error saving accumulated token usage:", err));
    }
    const typingEndEvent = {
      type: "typing",
      botUserId,
      nickname: botNickname,
      typing: false,
      isPrivate: replyIsPrivate,
      targetUserId: targetUserId,
      userId: botUserId
    };
    if (replyIsPrivate && targetUserId) {
      emitToUser(roomId, targetUserId, typingEndEvent);
      if (targetUserId !== room.hostId) emitToUser(roomId, room.hostId, typingEndEvent);
    } else {
      broadcastToRoom(roomId, typingEndEvent);
    }
  }

  // 5. Trigger Incremental Summarization (Task #36)
  summarizeHistoryAction(botUserId, roomId).catch(console.error);
}

/**
 * summarizeHistoryAction
 * Compresses older chat history into a persistent summary.
 */
export async function summarizeHistoryAction(botUserId: number, roomId: number) {
  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser) return;

  const config = parseBotConfig(botUser.botConfigJson);
  const lastId = config.lastSummarizedMsgId;

  // Count new messages since last summary
  const newMsgs = await db.select().from(messages)
    .where(and(eq(messages.roomId, roomId), gt(messages.id, lastId)))
    .orderBy(asc(messages.id))
    .limit(500);
  
  if (newMsgs.length < 30) return; // Threshold not met

  // Get AI Config for summarization (use configured, fallback to host, fallback to shared)
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return;

  if (!config.providerId) {
    console.error(`[summarizeHistoryAction] Bot ${botUserId} has no AI Provider configured`);
    return;
  }

  const [aiConfig] = await db.select().from(aiProviders).where(eq(aiProviders.id, config.providerId));
  if (!aiConfig) {
    console.error(`[summarizeHistoryAction] Configured AI Provider (ID: ${config.providerId}) not found for bot ${botUserId}`);
    return;
  }

  // Verify quota for shared provider
  if (aiConfig.isShared) {
    const [hostUser] = await db.select().from(users).where(eq(users.id, room.hostId)).limit(1);
    if (hostUser && hostUser.role !== "admin" && Number(hostUser.aiPoints || 0) <= 0) {
      console.log(`[summarizeHistoryAction] Host ${room.hostId} quota exhausted for shared provider. Skipping summary.`);
      return;
    }
  }

  let apiKey: string;
  try {
    apiKey = decrypt(aiConfig.apiKeyEncrypted);
  } catch {
    console.error(`[summarizeHistoryAction] Provider API key cannot be decrypted (key mismatch) — delete and re-create the provider.`);
    return;
  }
  const endpoint = aiConfig.apiEndpoint;

  const msgText = newMsgs.map(m => `[${m.nickname}]: ${m.content}`).join("\n");
  const oldSummary = config.historicalSummary || "";

  let response;
  try {
    response = await fetchWithBackoff(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: config.model || "gpt-4o",
        messages: [
          { role: "system", content: "You are a TRPG chronicler. Update the existing summary with the new chat log provided. Keep it concise, capturing key events, plot points, and character state changes." },
          { role: "user", content: `Existing Summary:\n${oldSummary}\n\nNew Chat Log:\n${msgText}\n\nProvide the updated summary:` }
        ]
      })
    });
  } catch (err) {
    console.error("[summarizeHistoryAction] AI API request failed after retries:", err);
    return;
  }

  if (response.ok) {
    const data = await response.json();

    // Record token usage (always billed to the room host who manages/owns the bot in this room)
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const cachedInputTokens = usage.prompt_tokens_details?.cached_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    await recordTokenUsage(room.hostId, aiConfig.id, inputTokens, cachedInputTokens, outputTokens);

    const newSummary = data.choices[0].message.content;
    
    // Save back to Bot Config
    config.historicalSummary = newSummary;
    config.lastSummarizedMsgId = newMsgs[newMsgs.length - 1].id;
    
    await db.update(users).set({ botConfigJson: JSON.stringify(config) }).where(eq(users.id, botUserId));
  }
}
