import { db } from "@/db";
import { users, messages, inventoryDistributions, inventoryItems, rooms, hostAiConfig } from "@/db/schema";
import { eq, and, desc, asc, gt, sql } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { broadcastToRoom } from "@/lib/events";

/**
 * buildAgentContext
 * Constructs the LLM context for a specific Bot.
 */
export async function buildAgentContext(botUserId: number, roomId: number) {
  const [botUser] = await db.select().from(users).where(eq(users.id, botUserId));
  if (!botUser || !botUser.isBot) throw new Error("Bot user not found");
  
  const config = botUser.botConfigJson ? JSON.parse(botUser.botConfigJson) : {};
  const sysPrompt = config.systemPrompt || "You are an AI assistant in a TRPG session.";
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

  const history = await db.select().from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  const sortedHistory = [...history].reverse();

  const context: any[] = [
    {
      role: "system",
      content: `${sysPrompt}\n\n[Historical Summary]:\n${summary || "No history yet."}\n\n[Your Current Knowledge/Items]:\n${JSON.stringify(knowledgeBase)}\n\nYou can use 'inspect_item(itemId)' to see details of any item you possess.`
    }
  ];

  for (const msg of sortedHistory) {
    if (msg.userId === botUserId) {
      context.push({ role: "assistant", content: msg.content });
    } else if (msg.type === "text") {
      context.push({ role: "user", name: msg.nickname, content: msg.content });
    }
  }

  return { context, model: config.model || "gpt-4o" };
}

/**
 * runAgent
 * Orchestrates the LLM call and Tool execution.
 */
export async function runAgent(botUserId: number, roomId: number) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return;

  const [aiConfig] = await db.select().from(hostAiConfig).where(eq(hostAiConfig.userId, room.hostId));
  if (!aiConfig) return;

  const apiKey = decrypt(aiConfig.apiKeyEncrypted);
  const endpoint = aiConfig.apiEndpoint;

  const { context, model } = await buildAgentContext(botUserId, roomId);

  const tools = [
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
    }
  ];

  let currentContext = [...context];
  let iterations = 0;

  while (iterations < 3) {
    iterations++;

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: currentContext, tools, tool_choice: "auto" })
    });

    if (!response.ok) break;

    const data = await response.json();
    const assistantMessage = data.choices[0].message;
    currentContext.push(assistantMessage);

    if (!assistantMessage.tool_calls) {
      if (assistantMessage.content) {
        const botUser = await db.query.users.findFirst({ where: eq(users.id, botUserId) });
        const [newMessage] = await db.insert(messages).values({
          roomId,
          userId: botUserId,
          nickname: botUser?.displayName || "AI",
          content: assistantMessage.content,
          type: "text"
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
          const rollResults = Array.from({ length: args.count }, () => Math.floor(Math.random() * args.faces) + 1);
          const sum = rollResults.reduce((a, b) => a + b, 0);
          const detail = JSON.stringify({ dice: `d${args.faces}`, count: args.count, results: rollResults, sum, isBot: true });
          const content = `🤖 (AI) 🎲 ${args.count}d${args.faces}: [${rollResults.join(", ")}] = ${sum}`;
          const [newMessage] = await db.insert(messages).values({
            roomId, userId: botUserId, nickname: "AI", content: args.isPrivate ? `🔒 ${content}` : content,
            type: "dice", diceDetail: detail, isPrivate: !!args.isPrivate
          }).returning();
          broadcastToRoom(roomId, newMessage);
          result = { success: true, sum };
        } else if (functionName === "send_message") {
          const [newMessage] = await db.insert(messages).values({
            roomId, userId: botUserId, nickname: "AI", content: args.content, type: "text", isPrivate: !!args.isPrivate
          }).returning();
          broadcastToRoom(roomId, newMessage);
          result = { success: true };
        } else if (functionName === "inspect_item") {
          const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, args.itemId));
          result = item ? { title: item.title, content: JSON.parse(item.contentJson) } : { error: "Item not found" };
        }
      } catch (e: any) { result = { error: e.message }; }

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

  const config = botUser.botConfigJson ? JSON.parse(botUser.botConfigJson) : {};
  const lastId = config.lastSummarizedMsgId || 0;

  // Count new messages since last summary
  const newMsgs = await db.select().from(messages).where(and(eq(messages.roomId, roomId), gt(messages.id, lastId)));
  
  if (newMsgs.length < 30) return; // Threshold not met

  // Get Host AI Config for summarization
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const [aiConfig] = await db.select().from(hostAiConfig).where(eq(hostAiConfig.userId, room.hostId));
  if (!aiConfig) return;

  const apiKey = decrypt(aiConfig.apiKeyEncrypted);
  const endpoint = aiConfig.apiEndpoint;

  const msgText = newMsgs.map(m => `[${m.nickname}]: ${m.content}`).join("\n");
  const oldSummary = config.historicalSummary || "";

  const response = await fetch(`${endpoint}/chat/completions`, {
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

  if (response.ok) {
    const data = await response.json();
    const newSummary = data.choices[0].message.content;
    
    // Save back to Bot Config
    config.historicalSummary = newSummary;
    config.lastSummarizedMsgId = newMsgs[newMsgs.length - 1].id;
    
    await db.update(users).set({ botConfigJson: JSON.stringify(config) }).where(eq(users.id, botUserId));
  }
}
