import { db, sqlNow } from "@/db";
import { recordTokenUsage } from "@/lib/ai_usage";
import { users, messages, inventoryDistributions, inventoryItems, rooms, aiProviders, roomMembers, roomSkills, clueCards, clueVisibility, systemConfig } from "@/db/schema";
import { eq, and, asc, desc, gt, sql, or, isNull, inArray } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { broadcastToRoom, emitToUser } from "@/lib/events";
import { dispatchMessage } from "@/lib/messaging/router";
import { buildDispatchPayload, buildReceiptPayload } from "@/lib/messaging/dispatch-payload";
import { shareItemCore } from "@/lib/inventory-share";
import { getTranslations } from "next-intl/server";
import { rollDice } from "@/lib/utils";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { executeCommand } from "@/lib/commands";
import { z } from "zod";
import type { CharacterData } from "@/lib/character-types";
import { clampInt, getRuleForRoom, listRules, listRuleIds } from "@/lib/rules";
import { validateApiEndpoint } from "@/lib/url-guard";
import { resolveToolCall } from "@/lib/agent-tool-guard";

// Zod Schema for Bot Config Validation (R17)
const BotConfigSchema = z.object({
  roomId: z.number().optional(),
  systemPrompt: z.string().optional().default("You are an AI assistant in a TRPG session."),
  historicalSummary: z.string().optional().default(""),
  model: z.string().optional().default("gpt-4o"),
  activation: z.string().optional().default("mention"),
  enableTools: z.array(z.string()).optional().default(["roll_dice", "respond_check"]),
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

/**
 * Cap a single tool result before it's appended to the LLM context. Repeated
 * `search_history` / `my_inventory` / etc. calls can otherwise accumulate
 * megabytes inside `currentContext` across iterations and blow past the
 * model's window. 4 KB per result keeps the loop bounded while still leaving
 * room for a reasonable structured response (200+ chars per record times
 * ~10 records).
 *
 * Truncated payloads end with an explicit `…[truncated]` marker so the model
 * can decide whether to narrow its next query rather than silently consuming
 * a cut JSON.
 */
const TOOL_RESULT_MAX_BYTES = 4 * 1024;
function capToolContent(content: string): string {
  if (content.length <= TOOL_RESULT_MAX_BYTES) return content;
  return content.slice(0, TOOL_RESULT_MAX_BYTES) + "…[truncated]";
}

/**
 * Fetch helper with exponential backoff (R9) — only retries when retrying
 * could actually help:
 *  - 2xx → done.
 *  - 4xx (except 429) → client error (bad key, malformed request, etc).
 *    Retrying just burns the shared-provider quota and re-bills the host,
 *    so we return the response as-is and let the caller surface it.
 *  - 429 → honor `Retry-After` if present, else use the backoff schedule.
 *  - 5xx / network errors → retry up to `maxRetries`.
 *
 * Delay is doubled each attempt and capped at MAX_DELAY_MS so a long
 * `Retry-After` can't park a worker for minutes.
 */
const MAX_BACKOFF_DELAY_MS = 16_000;
async function fetchWithBackoff(url: string, options: RequestInit, maxRetries = 3, initialDelay = 1000): Promise<Response> {
  // Re-validate at call time (not just when the provider was saved): DNS can
  // change after the fact, and this closes that TOCTOU window before every
  // outbound request to a host-configured endpoint.
  const endpointCheck = await validateApiEndpoint(url);
  if (!endpointCheck.valid) {
    throw new Error(`Blocked outbound AI request: ${endpointCheck.error}`);
  }

  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      const isClientError = response.status >= 400 && response.status < 500 && response.status !== 429;
      if (isClientError) {
        // No point retrying — let the caller decode the body and report.
        return response;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const seconds = Number(retryAfter);
          if (Number.isFinite(seconds) && seconds > 0) {
            delay = Math.min(seconds * 1000, MAX_BACKOFF_DELAY_MS);
          }
        }
      }

      if (attempt === maxRetries) return response;
      console.warn(`[AI API] Attempt ${attempt} failed with status ${response.status}. Retrying in ${delay}ms...`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`[AI API] Attempt ${attempt} encountered error: ${error}. Retrying in ${delay}ms...`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, MAX_BACKOFF_DELAY_MS);
  }
  throw new Error("Failed after maximum retries");
}

/**
 * Message types the bot's LLM pipeline consumes. Shared by the context
 * builder (in-memory filter) and the history summarizer (SQL filter) so the
 * two cannot drift apart.
 */
const BOT_READABLE_MESSAGE_TYPES = ["text", "dice", "clue", "system", "check_request"];

/**
 * Visibility condition for every query that feeds room messages to the bot's
 * LLM: public messages, or private messages the bot is itself a party to.
 * Any query whose rows can reach the model (context builder, history
 * summarizer, search_history, respond_check scan) must include this — the
 * summarizer previously lacked it and leaked player-to-player DMs and
 * GM-only notices into the external LLM call and the persisted
 * historicalSummary.
 */
function visibleToBotSql(botUserId: number) {
  return sql`(${messages.isPrivate} = FALSE OR ${messages.userId} = ${botUserId} OR ${messages.targetUserId} = ${botUserId})`;
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
          visibleToBotSql(botUserId)
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
    } else if (BOT_READABLE_MESSAGE_TYPES.includes(msg.type)) {
      const prefix = msg.isPrivate ? "[私聊] " : "";
      context.push({ role: "user", content: `[${msg.nickname}]: ${prefix}${msg.content}` });
    }
  }

  return { context, model: config.model || "gpt-4o" };
}

// Cooldown map is process-wide intentionally — in production Next.js spawns
// multiple workers and a module-level Map would let a bot fire `workers ×`
// times per cooldown window. Pinning to globalThis collapses them onto one
// shared map. (Same pattern as the SSE EventEmitter — see CLAUDE.md.)
declare global {
  var __agentCooldowns: Map<number, number> | undefined;
}
const agentCooldowns: Map<number, number> = globalThis.__agentCooldowns ?? new Map<number, number>();
globalThis.__agentCooldowns = agentCooldowns;

const AGENT_COOLDOWN_MS = 3000;

/**
 * Upper bound on model↔tool iterations per run. The final iteration is a
 * forced wrap-up: tool definitions are withheld so the model must answer in
 * prose — i.e. at most MAX_AGENT_ITERATIONS - 1 tool rounds, then narration.
 */
const MAX_AGENT_ITERATIONS = 5;

/**
 * runAgent
 * Orchestrates the LLM call and Tool execution.
 */
export async function runAgent(
  botUserId: number,
  roomId: number,
  triggeringInfo?: {
    triggeringUserId: number;
    isPrivate: boolean;
    /**
     * Explicit host acts (check requests, the manual trigger button) must not
     * be silently dropped by the anti-storm cooldown — a host who mentions the
     * bot and issues a check within 3s would otherwise never get a response.
     * The cooldown timestamp is still recorded so the mention/DM path stays
     * throttled.
     */
    bypassCooldown?: boolean;
  }
) {
  const now = Date.now();
  // Prune stale cooldown entries to prevent the map from growing indefinitely
  for (const [id, ts] of agentCooldowns) {
    if (now - ts > AGENT_COOLDOWN_MS) agentCooldowns.delete(id);
  }
  const lastRun = agentCooldowns.get(botUserId) || 0;
  if (!triggeringInfo?.bypassCooldown && now - lastRun < AGENT_COOLDOWN_MS) {
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
  const enabledTools: string[] = botCfg.enableTools || ["roll_dice", "respond_check"];


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
        name: "respond_check",
        description: "Respond to a skill/attribute/sanity check that the host has requested FROM YOU. This rolls the check properly against your own character sheet (success/failure grading, SAN loss, etc.) and marks you as 'responded' on the host's request — exactly like a player clicking the host's check message. Use this instead of roll_dice whenever the host asks you to make a check. If you have no value set for the requested skill/stat, set it first via set_character_card, then respond.",
        parameters: {
          type: "object",
          properties: {
            checkRequestId: { type: "integer", description: "Optional message id of a specific pending check request. Omit to respond to the most recent check still awaiting you." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "roll_skill_check",
        description: "Proactively roll a skill/attribute check against YOUR OWN character sheet, using the room rule's `.rc` syntax (see [Room Rules] for the syntax of this room's rule). Use this when someone asks you in plain chat to make a check and there is NO formal pending check request — for a host-issued check request, use respond_check instead. If you have no value set for the skill/stat, set it first via set_character_card.",
        parameters: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Everything after '.rc' in the room rule's check syntax — e.g. '侦查' (COC), 'b2 侦查' (COC bonus dice), '运动+5 15' (d20 modifier vs DC)." },
            isPrivate: { type: "boolean", description: "Roll privately in the current DM. Defaults to matching the channel you were triggered in." }
          },
          required: ["expression"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_members",
        description: "List this room's members with their user ids, nicknames, and roles. Use this to resolve a nickname to a userId before calling give_item or reveal_clue.",
        parameters: { type: "object", properties: {}, required: [] }
      }
    },
    {
      type: "function",
      function: {
        name: "give_item",
        description: "Give an item from YOUR inventory to another player: the item is added to their backpack and they (plus the host) are notified. You must actually possess the item (check my_inventory). You cannot give to yourself or to another bot. Use list_members to find the recipient's userId.",
        parameters: {
          type: "object",
          properties: {
            itemId: { type: "integer", description: "Id of an item you possess (see my_inventory)" },
            toUserId: { type: "integer", description: "The recipient's userId (see list_members)" }
          },
          required: ["itemId", "toUserId"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "reveal_clue",
        description: "Reveal a clue card that YOU can see (check my_clues) to specific players: the clue appears in their clue list and they (plus the host) are notified. Use this when your role decides to hand game information to players. You cannot reveal to bots. Use list_members to find user ids.",
        parameters: {
          type: "object",
          properties: {
            clueId: { type: "integer", description: "Id of a clue visible to you (see my_clues)" },
            targetUserIds: { type: "array", items: { type: "integer" }, description: "userIds of the players to reveal the clue to (see list_members)" }
          },
          required: ["clueId", "targetUserIds"]
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
              description: "The rule template to use. 'coc7th' is for Call of Cthulhu 7th edition, 'basic' is for a generic TRPG character card, 'dnd5e' is for DnD 5e (d20), 'shouhun' is for 狩魂者 (Soul Hunter)."
            },
            name: { "type": "string", "description": "The character's name" },
            age: { "type": "integer", "description": "The character's age" },
            occupation: { "type": "string", "description": "The character's occupation" },
            bio: { "type": "string", "description": "The character's biography or backstory" },
            // Per-rule sheet fields, merged from every registered rule's
            // describeForAI() output. Adding a new rule auto-advertises its
            // sheet structure here — no manual edit needed.
            ...Object.assign(
              {},
              ...listRules().map(r => r.describeForAI().sheetToolSchemaFields)
            ),
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
  // The same whitelist is enforced again at execution time (resolveToolCall):
  // filtering the advertised definitions does not stop a model from emitting
  // a disabled or invented tool name.
  const knownToolNames = allTools.map(t => t.function.name);

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
            visibleToBotSql(botUserId)
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
    while (iterations < MAX_AGENT_ITERATIONS) {
      iterations++;
      // Force-text on the final iteration: withhold the tool definitions so
      // the model can only narrate. Without this, tools called on the last
      // round produce side effects (dice broadcasts, item transfers) whose
      // results the model never sees and never gets to describe.
      const isLastIteration = iterations === MAX_AGENT_ITERATIONS;

      let assistantMessage;
      let finishReason: string | undefined;
      try {
        const bodyPayload = {
          model,
          messages: currentContext,
          ...(tools.length > 0 && !isLastIteration ? { tools } : {})
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
        finishReason = data.choices[0].finish_reason;
      } catch (err: unknown) {
        console.error(`[runAgent] completion error:`, err);
        const content = `(${botNickname}) encountered an error connecting to AI: ${err instanceof Error ? err.message : String(err)}`;
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

      // Strip known chain-of-thought fields before echoing the message back:
      // DeepSeek reasoner-style models reject requests whose input contains
      // their own reasoning_content (400), which would kill the second round
      // of any tool loop. Only these named fields are removed — everything
      // else is preserved verbatim.
      delete assistantMessage.reasoning_content;
      delete assistantMessage.reasoning;

      // Add assistant response to context
      currentContext.push(assistantMessage);

      // If there is message text, broadcast it (R3) (filtered with sensitive words check)
      if (assistantMessage.content) {
        let textToSend = assistantMessage.content;
        const matchedWord = await checkSensitiveWords(textToSend);
        if (matchedWord) {
          console.warn(`[AI Sensitive Words] Bot ${botUserId} output matched sensitive word: ${matchedWord}. Redacting...`);
          textToSend = "(Output blocked due to sensitive content filter)";
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

      // A "length" finish means the reply hit the output token cap: the prose
      // is cut short and any tool_calls are likely half-emitted JSON, so
      // executing them would act on corrupted arguments. Stop the loop
      // instead — an HTTP 200 with finish_reason "length" is not a success.
      if (finishReason === "length") {
        console.warn(`[runAgent] Bot ${botUserId} reply truncated by the model's output limit (finish_reason=length); stopping tool loop.`);
        if (assistantMessage.tool_calls?.length) {
          const content = `(${botNickname}) reply was cut off by the model's output limit.`;
          await dispatchMessage({
            roomId,
            actorUserId: botUserId,
            nickname: botNickname,
            type: "text",
            audience: replyIsPrivate ? "dm" : "everyone",
            targetUserId: replyIsPrivate ? targetUserId : null,
            content: replyIsPrivate ? `🔒 ${content}` : content,
          });
        }
        break;
      }

      // If no tool calls, we are finished
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      // Tools were withheld on the final iteration, so tool_calls here are a
      // relay/model glitch — end the run rather than executing calls whose
      // results the model can never see.
      if (isLastIteration) {
        break;
      }

      const toolCallResults: { role: string; name?: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; function_call?: unknown }[] = [];
      for (const toolCall of assistantMessage.tool_calls) {
        // Execute tool calls sequentially to avoid DB race conditions on concurrent writes
        const functionName = toolCall.function.name;
        // Whitelist + argument guard: disabled/unknown tool names and malformed
        // argument JSON become readable tool-result errors instead of either
        // executing a tool the host turned off or throwing past the loop.
        const guard = resolveToolCall(functionName, toolCall.function.arguments ?? "", enabledTools, knownToolNames);
        if (!guard.ok) {
          toolCallResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: capToolContent(JSON.stringify({ success: false, error: guard.error })),
          });
          continue;
        }
        const args = guard.args;
        let result;

        try {
          if (functionName === "roll_dice") {
            const count = Math.max(1, Math.min(args.count || 1, 20));
            const faces = Math.max(1, Math.min(args.faces || 6, 1000));
            const { results: rollResults, sum } = rollDice(faces, count);
            const detail = JSON.stringify({ dice: `d${faces}`, count, results: rollResults, sum, isBot: true });
            const content = `(${botNickname}) 🎲 ${count}d${faces}: [${rollResults.join(", ")}] = ${sum}`;
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

            // Crit/fumble bounds belong to the rule: the module decides what a
            // plain roll means for its system via `naturalGrade` (COC reads
            // 01–05 / 96–100 on a raw 1d100; basic adds a "CoC-cultural" hint;
            // other rules return null). The engine never branches on rule id.
            const rollRule = getRuleForRoom(room || {});
            const evaluation = rollRule.naturalGrade?.(sum, faces, count) ?? undefined;

            result = {
              success: true,
              results: rollResults,
              sum,
              ruleTemplate: rollRule.id,
              ...(evaluation ? { evaluation } : {})
            };
          } else if (functionName === "respond_check") {
            // Find the pending check_request(s) the host issued to this bot.
            // Mirrors respondToCheckRequestAction (room.ts) but runs without a
            // session, attributing the roll to the bot.
            const candidates = await db.select({
              id: messages.id,
              diceDetail: messages.diceDetail,
              isPrivate: messages.isPrivate,
              audience: messages.audience,
              userId: messages.userId,
              targetUserId: messages.targetUserId,
            }).from(messages)
              .where(and(
                eq(messages.roomId, roomId),
                eq(messages.type, "check_request"),
                // Only checks visible to the bot: public, or a DM it's part of.
                visibleToBotSql(botUserId)
              ))
              .orderBy(desc(messages.createdAt))
              .limit(20);

            let chosen: {
              row: typeof candidates[number];
              cr: { skillName?: string; diceType?: string; targetUserIds?: number[]; respondedUserIds?: number[]; sanCheck?: { successExpr: string; failureExpr: string } };
            } | null = null;
            for (const row of candidates) {
              if (args.checkRequestId && row.id !== args.checkRequestId) continue;
              let cr;
              try { cr = JSON.parse(row.diceDetail || "{}").checkRequest; } catch { continue; }
              if (!cr || !cr.skillName) continue;
              const targets: number[] = cr.targetUserIds || [];
              const responded: number[] = cr.respondedUserIds || [];
              if (targets.includes(botUserId) && !responded.includes(botUserId)) {
                chosen = { row, cr };
                break;
              }
            }

            if (!chosen) {
              result = { success: false, error: "No pending check request is awaiting your response." };
            } else {
              const { row, cr } = chosen;
              // Roll in the same channel the request was issued in.
              const ctxIsPrivate = row.isPrivate;
              const ctxTargetId = row.isPrivate ? row.userId : undefined;
              const ctx = { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId };

              let cmdResult;
              if (cr.sanCheck) {
                cmdResult = await executeCommand(roomId, botUserId, `.sc ${cr.sanCheck.successExpr}/${cr.sanCheck.failureExpr}`, ctx);
              } else if ((cr.diceType || "d100") === "d100") {
                cmdResult = await executeCommand(roomId, botUserId, `.rc ${cr.skillName}`, ctx);
              } else {
                const faces = parseInt((cr.diceType || "d100").replace("d", ""));
                cmdResult = await executeCommand(roomId, botUserId, `.rd${faces}`, ctx);
              }

              if (!cmdResult.success) {
                // STAT_NOT_SET: the bot has no value for this skill/stat yet.
                result = {
                  success: false,
                  error: cmdResult.error,
                  needsSkill: cmdResult.code === "STAT_NOT_SET",
                  hint: cmdResult.code === "STAT_NOT_SET"
                    ? `Set "${cr.skillName}" via set_character_card, then call respond_check again.`
                    : undefined,
                };
              } else {
                // Record the response and broadcast the completion update so the
                // host's check bubble marks the bot as done (same as a click).
                // Re-parse the row defensively — the original parse happened in
                // the candidates scan above, but the row could have been rewritten
                // by another responder between then and now; without this guard a
                // malformed payload throws a TypeError that the outer catch turns
                // into an opaque error message in the tool result.
                let detail: { checkRequest?: { respondedUserIds?: number[]; proxiedUserIds?: number[] } } | null = null;
                try {
                  detail = JSON.parse(row.diceDetail || "{}");
                } catch {
                  detail = null;
                }
                if (!detail?.checkRequest) {
                  result = { success: false, error: "Check request payload malformed; refresh and try again." };
                } else {
                  const responded: number[] = detail.checkRequest.respondedUserIds || [];
                  const newResponded = [...responded, botUserId];
                  detail.checkRequest.respondedUserIds = newResponded;
                  await db.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, row.id));
                  broadcastToRoom(roomId, {
                    type: "check_update",
                    checkRequestId: row.id,
                    respondedUserIds: newResponded,
                    proxiedUserIds: detail.checkRequest.proxiedUserIds,
                    audience: row.audience,
                    userId: row.userId,
                    targetUserId: row.targetUserId,
                  });
                  const outcome = (cmdResult.message as { content?: string } | undefined)?.content;
                  result = { success: true, skillName: cr.skillName, sanityCheck: !!cr.sanCheck, ...(outcome ? { outcome } : {}) };
                }
              }
            }
          } else if (functionName === "roll_skill_check") {
            const raw = typeof args.expression === "string" ? args.expression.trim() : "";
            // Tolerate the model echoing the command prefix back.
            const expression = raw.replace(/^[.。]\s*rc\s*/i, "");
            if (!expression || expression.length > 100) {
              result = { success: false, error: "expression must be a non-empty string up to 100 characters (the text after '.rc')" };
            } else {
              // Default to the triggering channel so a DM-triggered bot doesn't
              // leak its roll into the public feed.
              const priv = typeof args.isPrivate === "boolean" ? args.isPrivate : replyIsPrivate;
              const ctx = priv && targetUserId ? { isPrivate: true, targetUserId } : undefined;
              const cmdResult = await executeCommand(roomId, botUserId, `.rc ${expression}`, ctx);
              if (!cmdResult.success) {
                result = {
                  success: false,
                  error: cmdResult.error,
                  needsSkill: cmdResult.code === "STAT_NOT_SET",
                  hint: cmdResult.code === "STAT_NOT_SET"
                    ? "Set the skill/stat via set_character_card, then call roll_skill_check again."
                    : undefined,
                };
              } else {
                const outcome = (cmdResult.message as { content?: string } | undefined)?.content;
                result = { success: true, ...(outcome ? { outcome } : {}) };
              }
            }
          } else if (functionName === "list_members") {
            const members = await db.select({
              userId: roomMembers.userId,
              nickname: roomMembers.nickname,
              isBot: users.isBot,
            }).from(roomMembers)
              .innerJoin(users, eq(roomMembers.userId, users.id))
              .where(eq(roomMembers.roomId, roomId))
              .limit(100);
            result = {
              count: members.length,
              members: members.map(m => ({
                userId: m.userId,
                nickname: m.nickname,
                isHost: m.userId === room.hostId,
                isBot: !!m.isBot,
                isSelf: m.userId === botUserId,
              })),
            };
          } else if (functionName === "give_item") {
            const itemId = Number(args.itemId);
            const toUserId = Number(args.toUserId);
            if (!Number.isInteger(itemId) || !Number.isInteger(toUserId)) {
              result = { success: false, error: "itemId and toUserId must be integers" };
            } else if (toUserId === botUserId) {
              result = { success: false, error: "You cannot give an item to yourself." };
            } else {
              const [recipientUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, toUserId));
              if (!recipientUser) {
                result = { success: false, error: "Recipient user not found" };
              } else if (recipientUser.isBot) {
                result = { success: false, error: "You cannot give items to another bot." };
              } else {
                const shareResult = await shareItemCore({
                  roomId,
                  itemId,
                  fromUserId: botUserId,
                  toUserId,
                  senderName: botNickname,
                });
                result = shareResult.success
                  ? { success: true, itemTitle: shareResult.itemTitle, recipient: shareResult.recipientName }
                  : { success: false, code: shareResult.code, error: shareResult.error };
              }
            }
          } else if (functionName === "reveal_clue") {
            const clueId = Number(args.clueId);
            const rawTargets: unknown[] = Array.isArray(args.targetUserIds) ? args.targetUserIds : [];
            const targetIds = [...new Set(rawTargets.map(Number).filter(n => Number.isInteger(n)))].slice(0, 30);
            if (!Number.isInteger(clueId) || targetIds.length === 0) {
              result = { success: false, error: "clueId (integer) and a non-empty targetUserIds array are required" };
            } else {
              const [clue] = await db.select().from(clueCards)
                .where(and(eq(clueCards.id, clueId), eq(clueCards.roomId, roomId)));
              if (!clue) {
                result = { success: false, error: "Clue not found in this room" };
              } else {
                const visRows = await db.select({ userId: clueVisibility.userId })
                  .from(clueVisibility)
                  .where(eq(clueVisibility.clueId, clueId));
                const isPublic = visRows.some(v => v.userId === null);
                // Scoped down from the host's reveal power: the bot may only
                // pass on clues it has itself been given.
                if (!isPublic && !visRows.some(v => v.userId === botUserId)) {
                  result = { success: false, error: "Unauthorized: this clue has not been revealed to you" };
                } else if (isPublic) {
                  result = { success: true, alreadyPublic: true, revealedTo: [] };
                } else {
                  const memberRows = await db.select({ userId: roomMembers.userId, isBot: users.isBot })
                    .from(roomMembers)
                    .innerJoin(users, eq(roomMembers.userId, users.id))
                    .where(eq(roomMembers.roomId, roomId));
                  const humanMembers = new Set(memberRows.filter(m => !m.isBot).map(m => m.userId));
                  const alreadyVisible = new Set(visRows.map(v => v.userId));
                  const invalid = targetIds.filter(uid => !humanMembers.has(uid));
                  if (invalid.length > 0) {
                    result = { success: false, error: `Invalid target user ids (not human members of this room): ${invalid.join(", ")}` };
                  } else {
                    const newTargets = targetIds.filter(uid => !alreadyVisible.has(uid));
                    if (newTargets.length === 0) {
                      result = { success: true, revealedTo: [], note: "All targets can already see this clue." };
                    } else {
                      await db.insert(clueVisibility).values(newTargets.map(uid => ({ clueId, userId: uid })));
                      const tClue = await getTranslations("clueActions");
                      for (const uid of newTargets) {
                        await dispatchMessage({
                          roomId,
                          actorUserId: botUserId,
                          nickname: botNickname,
                          type: "system",
                          audience: "recipient",
                          targetUserId: uid,
                          systemKind: "inventory-receipt",
                          content: tClue("clueReceived", { title: clue.title }),
                          diceDetail: buildReceiptPayload({
                            action: "received",
                            itemType: "clue",
                            itemTitle: clue.title,
                          }),
                        });
                      }
                      const recipients = await db.select({ name: users.displayName })
                        .from(users)
                        .where(inArray(users.id, newTargets));
                      const recipientNames = recipients.map(r => r.name).join(", ");
                      await dispatchMessage({
                        roomId,
                        actorUserId: botUserId,
                        nickname: botNickname,
                        type: "system",
                        audience: "gm",
                        systemKind: "inventory-dispatch",
                        content: tClue("cluePushLog", { recipients: recipientNames || tClue("defaultPlayers"), title: clue.title }),
                        diceDetail: buildDispatchPayload({
                          action: "push",
                          itemType: "clue",
                          itemTitle: clue.title,
                          recipient: { kind: "user", name: recipientNames || tClue("defaultPlayers") },
                        }),
                      });
                      result = { success: true, clueTitle: clue.title, revealedTo: newTargets };
                    }
                  }
                }
              }
            }
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
            // Defend against runaway LLM inputs: an oversize query would expand
            // into a huge LIKE pattern and tank the messages-table scan. The
            // model has no legitimate reason to send >100 chars.
            const query = typeof args.query === "string" ? args.query.trim() : "";
            if (!query || query.length > 100) {
              result = { error: "query must be a non-empty string up to 100 characters" };
            } else {
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
                    visibleToBotSql(botUserId),
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
            }
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
            const charData: CharacterData | null = memberInfo?.characterData
              ? JSON.parse(memberInfo.characterData)
              : null;
            // `exportSnapshot` is each rule's own answer to "what on this sheet
            // is worth reporting?" — reading `cocAttributes`/`cocDerived`
            // directly handed a d20 or Triangle bot two nulls and no way to
            // learn its own stats.
            const sheetRule = getRuleForRoom(room || {});
            result = {
              hasCharacterSheet: !!charData,
              sheet: charData ? sheetRule.exportSnapshot(charData) : null,
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

            const sheetRule = getRuleForRoom(room || { ruleTemplate: args.ruleTemplate as string | undefined });

            // Cap customAttributes — the schema is `{name, value, max?}[]` and
            // the model has no legitimate reason to emit dozens of them. Pre-
            // capping here keeps the persisted JSON small.
            const trimmedCustom = Array.isArray(args.customAttributes)
              ? args.customAttributes.slice(0, 30)
              : undefined;

            const merged: CharacterData = {
              ...existing,
              ...(args.ruleTemplate ? { ruleTemplate: args.ruleTemplate } : {}),
              ...(args.name !== undefined ? { name: args.name } : {}),
              ...(args.age !== undefined ? { age: args.age } : {}),
              ...(args.occupation !== undefined ? { occupation: args.occupation } : {}),
              ...(args.bio !== undefined ? { bio: args.bio } : {}),
              ...(trimmedCustom !== undefined ? { customAttributes: trimmedCustom } : {}),
            };

            // The model is not trusted to stay within bounds, and only the
            // rule knows its own storage bag and legal ranges — so the rule
            // that advertised these fields in `describeForAI` is also the one
            // that validates them. Branching on the rule id here is what left
            // Triangle and 狩魂者 writes silently dropped.
            Object.assign(merged, sheetRule.applySheetPatch(merged, args as Record<string, unknown>));

            // Always run derivation through the rule so future computed
            // fields (e.g. COC cocDerived recomputation, d20 HP clamp) stay
            // consistent regardless of which keys the model touched.
            Object.assign(merged, sheetRule.computeDerived(merged));

            await db.update(roomMembers)
              .set({ characterData: JSON.stringify(merged) })
              .where(and(
                eq(roomMembers.roomId, roomId),
                eq(roomMembers.userId, botUserId)
              ));

            if (args.skills && Array.isArray(args.skills)) {
              // Cap the skills list — a hallucinating model could otherwise emit
              // thousands of entries and block the tool loop on sequential
              // INSERTs. 50 covers any realistic character sheet.
              const skillsToWrite = args.skills.slice(0, 50);
              for (const skill of skillsToWrite) {
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

        // Belt-and-suspenders: the guard guarantees functionName matched a
        // dispatch branch, but an undefined result must still serialize into
        // a valid tool reply — JSON.stringify(undefined) is not a string.
        if (result === undefined) {
          result = { success: false, error: `Tool "${functionName}" produced no result.` };
        }

        toolCallResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: capToolContent(JSON.stringify(result)),
        });
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

  // Count new messages since last summary. The visibility filter is not
  // optional here: this text is sent verbatim to an external LLM and the
  // resulting summary is persisted into the bot's system prompt — without it,
  // player-to-player DMs, GM-only notices, and hidden rolls all leak.
  const newMsgs = await db.select().from(messages)
    .where(and(
      eq(messages.roomId, roomId),
      gt(messages.id, lastId),
      visibleToBotSql(botUserId),
      inArray(messages.type, BOT_READABLE_MESSAGE_TYPES)
    ))
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
