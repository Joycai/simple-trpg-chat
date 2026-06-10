import { db } from "@/db";
import { users, messages, inventoryDistributions, inventoryItems, rooms, aiProviders, roomMembers, roomSkills, clueCards, clueVisibility } from "@/db/schema";
import { eq, and, desc, gt, sql, or, isNull } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { broadcastToRoom } from "@/lib/events";
import { rollDice } from "@/lib/utils";
import { z } from "zod";

// Zod Schema for Bot Config Validation (R17)
const BotConfigSchema = z.object({
  roomId: z.number().optional(),
  systemPrompt: z.string().optional().default("You are an AI assistant in a TRPG session."),
  historicalSummary: z.string().optional().default(""),
  model: z.string().optional().default("gpt-4o"),
  activation: z.string().optional().default("mention"),
  enableTools: z.array(z.string()).optional().default(["send_message", "roll_dice"]),
  lastSummarizedMsgId: z.number().optional().default(0),
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
export async function buildAgentContext(botUserId: number, roomId: number) {
  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser || !botUser.isBot) throw new Error("Bot user not found");
  
  const config = parseBotConfig(botUser.botConfigJson);
  const sysPrompt = config.systemPrompt;
  const summary = config.historicalSummary || "";

  const distributions = await db.query.inventoryDistributions.findMany({
    where: and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.toUserId, botUserId)
    ),
    with: { item: true }
  });

  const knowledgeBase = distributions.map(d => ({
    id: d.itemId,
    title: d.item.title,
    type: d.item.type
  }));

  // Limit to public messages or private messages involving the bot
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

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const diceRules = room?.diceRules || "basic";
  const rulesExplanation = diceRules === "coc7th"
    ? "Room Dice Rules: COC 7th edition (d100 rolls: 1-5 is Critical Success (大成功), 96-100 is Fumble/Critical Failure (大失败). Lower results are better in skill checks)."
    : "Room Dice Rules: Basic (No special success/failure grading for raw dice rolls). Note that in CoC/TRPG culture, rolling 100 on d100 is culturally considered a Fumble (大失败), and 1 is a Critical Success (大成功). Please react appropriately to dice roll results.";

  const context: { role: string; name?: string; content: string; tool_calls?: any; tool_call_id?: string }[] = [
    {
      role: "system",
      content: `${sysPrompt}\n\n[Room Information]:\n- Room ID: ${roomId}\n- Room Name: ${room?.name || "Unknown"}\n- Dice Rules: ${diceRules}\n- Rule Note: ${rulesExplanation}\n\n[Historical Summary]:\n${summary || "No history yet."}\n\n[Your Current Knowledge/Items]:\n${JSON.stringify(knowledgeBase)}\n\nYou can use 'inspect_item(itemId)' to see details of any item you possess.`
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

/**
 * runAgent
 * Orchestrates the LLM call and Tool execution.
 */
export async function runAgent(botUserId: number, roomId: number) {
  const now = Date.now();
  const lastRun = agentCooldowns.get(botUserId) || 0;
  if (now - lastRun < 3000) {
    console.log(`[RateLimit] Bot ${botUserId} skipped due to 3s cooldown`);
    return;
  }
  agentCooldowns.set(botUserId, now);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return;

  const [aiConfig] = await db.select().from(aiProviders).where(eq(aiProviders.ownerId, room.hostId));
  if (!aiConfig) return;

  const apiKey = decrypt(aiConfig.apiKeyEncrypted);
  const endpoint = aiConfig.apiEndpoint;

  const { context, model } = await buildAgentContext(botUserId, roomId);

  // Read enabled tools from bot config
  const [botConfig] = await db.select({ botConfigJson: users.botConfigJson })
    .from(users).where(eq(users.id, botUserId));

  const botCfg = parseBotConfig(botConfig?.botConfigJson);
  const enabledTools: string[] = botCfg.enableTools || ["send_message", "roll_dice"];


  const allTools = [
    {
      type: "function",
      function: {
        name: "roll_dice",
        description: "Roll dice for the TRPG game",
        parameters: {
          type: "object",
          properties: {
            faces: { type: "integer" },
            count: { type: "integer" },
            isPrivate: { type: "boolean" }
          },
          required: ["faces", "count"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_message",
        description: "Send a message to the chat room",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string" },
            isPrivate: { type: "boolean" }
          },
          required: ["content"]
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
    }
  ];
  // Filter to only enabled tools for this bot
  const tools = allTools.filter(t => enabledTools.includes(t.function.name));

  const currentContext: { role: string; name?: string; content?: string | null; tool_calls?: any; tool_call_id?: string; function_call?: any }[] = [...context];
  let iterations = 0;

  // Retrieve bot's room nickname first
  const [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId)));
  
  const botUser = await db.query.users.findFirst({ where: eq(users.id, botUserId) });
  const botNickname = member?.nickname || botUser?.displayName || "AI";

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

  // Check if the triggering context was private and identify the target user
  let replyIsPrivate = false;
  let targetUserId: number | null = null;

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

  if (!targetUserId) {
    targetUserId = room.hostId;
  }

  while (iterations < 3) {
    iterations++;

    let response;
    try {
      response = await fetchWithBackoff(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: currentContext, tools, tool_choice: "auto" })
      });
    } catch (err) {
      console.error("[runAgent] AI API request failed after retries:", err);
      break;
    }

    if (!response || !response.ok) break;

    const data = await response.json();
    const assistantMessage = data.choices[0].message;
    currentContext.push(assistantMessage);

    if (!assistantMessage.tool_calls) {
      if (assistantMessage.content) {
        const [newMessage] = await db.insert(messages).values({
          roomId,
          userId: botUserId,
          targetUserId: replyIsPrivate ? targetUserId : null,
          nickname: botNickname,
          content: assistantMessage.content,
          type: "text",
          isPrivate: replyIsPrivate
        }).returning();
        broadcastToRoom(roomId, newMessage);
      }
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let result;

      try {
        if (functionName === "roll_dice") {
          const { results: rollResults, sum } = rollDice(args.faces, args.count);
          const detail = JSON.stringify({ dice: `d${args.faces}`, count: args.count, results: rollResults, sum, isBot: true });
          const content = `🤖 (${botNickname}) 🎲 ${args.count}d${args.faces}: [${rollResults.join(", ")}] = ${sum}`;
          const [newMessage] = await db.insert(messages).values({
            roomId,
            userId: botUserId,
            targetUserId: args.isPrivate ? targetUserId : null,
            nickname: botNickname,
            content: args.isPrivate ? `🔒 ${content}` : content,
            type: "dice",
            diceDetail: detail,
            isPrivate: !!args.isPrivate
          }).returning();
          broadcastToRoom(roomId, newMessage);

          // Get the room rules
          const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
          const roomDiceRules = room?.diceRules || "basic";

          let evaluation = undefined;
          if (args.faces === 100 && args.count === 1) {
            if (roomDiceRules === "coc7th") {
              if (sum <= 5) {
                evaluation = "Critical Success (大成功)";
              } else if (sum >= 96) {
                evaluation = "Fumble (大失败)";
              }
            } else {
              // Even under basic rules, 100 on d100 is culturally/historically a Fumble in CoC/TRPG,
              // and 1 is a Critical Success.
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
            diceRules: roomDiceRules,
            ...(evaluation ? { evaluation } : {})
          };
        } else if (functionName === "send_message") {
          const [newMessage] = await db.insert(messages).values({
            roomId,
            userId: botUserId,
            targetUserId: args.isPrivate ? targetUserId : null,
            nickname: botNickname,
            content: args.content,
            type: "text",
            isPrivate: !!args.isPrivate
          }).returning();
          broadcastToRoom(roomId, newMessage);
          result = { success: true };
        } else if (functionName === "inspect_item") {
          const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, args.itemId));
          result = item ? { title: item.title, content: JSON.parse(item.contentJson) } : { error: "Item not found" };
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
                sql`${messages.content} LIKE ${'%' + safeQuery + '%'} ESCAPE '\'`
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
          const [member] = await db.select({
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
          const charData = member?.characterData ? JSON.parse(member.characterData) : null;
          result = {
            hasCharacterSheet: !!charData,
            attributes: charData?.cocAttributes || null,
            derived: charData?.cocDerived || null,
            skills: skills.map(s => ({ name: s.skillName, value: s.skillValue })),
            customAttributes: charData?.customAttributes || [],
          };
        }
      } catch (e: unknown) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }

      currentContext.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
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
  const newMsgs = await db.select().from(messages).where(and(eq(messages.roomId, roomId), gt(messages.id, lastId)));
  
  if (newMsgs.length < 30) return; // Threshold not met

  // Get Host AI Config for summarization
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const [aiConfig] = await db.select().from(aiProviders).where(eq(aiProviders.ownerId, room.hostId));
  if (!aiConfig) return;

  const apiKey = decrypt(aiConfig.apiKeyEncrypted);
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
    const newSummary = data.choices[0].message.content;
    
    // Save back to Bot Config
    config.historicalSummary = newSummary;
    config.lastSummarizedMsgId = newMsgs[newMsgs.length - 1].id;
    
    await db.update(users).set({ botConfigJson: JSON.stringify(config) }).where(eq(users.id, botUserId));
  }
}
