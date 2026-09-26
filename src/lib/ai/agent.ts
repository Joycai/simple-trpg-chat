import { db } from "@/db";
import { recordTokenUsage } from "@/lib/ai/usage";
import { users, messages, inventoryDistributions, rooms, aiProviders, roomMembers, systemConfig, type MessageType } from "@/db/schema";
import { eq, and, asc, desc, gt } from "drizzle-orm";
import { decrypt } from "@/lib/security/encryption";
import { broadcastToRoom, emitToUser } from "@/lib/server/events";
import { dispatchMessage, messageVisibilityWhere } from "@/lib/messaging/router";
import { canSee } from "@/lib/messaging/audience";
import { checkSensitiveWords } from "@/lib/security/sensitive-words";
import { z } from "zod";
import { getRuleForRoom } from "@/lib/rules";
import { validateApiEndpoint } from "@/lib/security/url-guard";
import { resolveToolCall } from "@/lib/ai/agent-tool-guard";
import { buildAgentToolDefinitions } from "@/lib/ai/agent-tool-definitions";
import { AGENT_TOOL_HANDLERS, type AgentToolContext } from "@/lib/ai/agent-tool-handlers";

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
 * Message types the bot's LLM pipeline consumes (of OTHER users' messages —
 * the bot's own rows are exempt in both consumers). Shared by the context
 * builder and the history summarizer. Typed against the schema's MessageType
 * union so a typo or a renamed type is a compile error, and the subset
 * relationship to MESSAGE_TYPES is enforced by the type itself.
 */
const BOT_READABLE_MESSAGE_TYPES: readonly MessageType[] = ["text", "dice", "clue", "system", "check_request"];

/**
 * Visibility for every query that feeds room messages to the bot's LLM
 * (context builder, history summarizer, search_history, respond_check scan)
 * is `messageVisibilityWhere(roomId, botUserId, false)` — the app's single
 * audience-based predicate from the messaging router. Do NOT hand-roll a
 * predicate on `messages.isPrivate` here: that column is a legacy write-only
 * mirror (see schema.ts), and the summarizer once lacked any filter at all,
 * leaking player DMs and GM-only notices into the external LLM call and the
 * persisted historicalSummary. Bots are never the room host, so
 * `viewerIsHost` is always false.
 */

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
          messageVisibilityWhere(roomId, botUserId, false),
          gt(messages.id, config.lastSummarizedMsgId)
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
    } else if ((BOT_READABLE_MESSAGE_TYPES as readonly string[]).includes(msg.type)) {
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

/** How a run was triggered. Every current caller passes one; without it, the reply channel is inferred from recent history. */
interface AgentTrigger {
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

type AgentChatMessage = { role: string; name?: string; content?: string | null; tool_calls?: unknown; tool_call_id?: string; function_call?: unknown };

/** Where the bot's replies and typing indicator go for this run. */
interface AgentReplyTarget {
  roomId: number;
  botUserId: number;
  botNickname: string;
  replyIsPrivate: boolean;
  targetUserId: number | null;
}

/** Token counts summed across the loop's completions; billed once in runAgent's finally. */
interface TokenTally {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Anti-storm gate: false when the bot ran inside the cooldown window and the trigger doesn't bypass it. */
function checkAndConsumeCooldown(botUserId: number, bypassCooldown?: boolean): boolean {
  const now = Date.now();
  // Prune stale cooldown entries to prevent the map from growing indefinitely
  for (const [id, ts] of agentCooldowns) {
    if (now - ts > AGENT_COOLDOWN_MS) agentCooldowns.delete(id);
  }
  const lastRun = agentCooldowns.get(botUserId) || 0;
  if (!bypassCooldown && now - lastRun < AGENT_COOLDOWN_MS) {
    console.log(`[RateLimit] Bot ${botUserId} skipped due to 3s cooldown`);
    return false;
  }
  agentCooldowns.set(botUserId, now);
  return true;
}

/** Load the room, the bot's user row and its membership; null when the room or bot is gone. */
async function loadAgentRunContext(roomId: number, botUserId: number) {
  // Retrieve room, botUser, and roomMember records in parallel
  const [roomResult, botUserResult, memberResult] = await Promise.all([
    db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1),
    db.select().from(users).where(eq(users.id, botUserId)).limit(1),
    db.select().from(roomMembers).where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, botUserId))).limit(1)
  ]);

  const room = roomResult[0];
  const botUser = botUserResult[0];
  const member = memberResult[0];

  if (!room || !botUser) return null;
  return { room, botUser, member };
}

async function isAiGloballyEnabled(botUserId: number): Promise<boolean> {
  const [globalAiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  if (globalAiConfig?.value !== "true") {
    console.log(`[runAgent] Bot ${botUserId} skipped because AI features are globally disabled`);
    return false;
  }
  return true;
}

/**
 * Resolve the bot's AI provider and its decrypted key, or null (after logging
 * why) when the run can't use it: none configured, missing, not the host's
 * and not shared, shared but the host is out of points, or undecryptable.
 */
async function resolveAgentProvider(botUserId: number, room: typeof rooms.$inferSelect, botCfg: BotConfig) {
  if (!botCfg.providerId) {
    console.error(`[runAgent] Bot ${botUserId} has no AI Provider configured`);
    return null;
  }

  const [aiConfig] = await db.select().from(aiProviders).where(eq(aiProviders.id, botCfg.providerId));
  if (!aiConfig) {
    console.error(`[runAgent] Configured AI Provider (ID: ${botCfg.providerId}) not found for bot ${botUserId}`);
    return null;
  }

  // Verify that provider is owned by the room's host or is shared globally
  if (aiConfig.ownerId !== room.hostId && !aiConfig.isShared) {
    console.error(`[runAgent] AI Provider (ID: ${botCfg.providerId}) is neither owned by room host ${room.hostId} nor shared globally.`);
    return null;
  }

  // Verify quota for shared provider
  if (aiConfig.isShared) {
    const [hostUser] = await db.select().from(users).where(eq(users.id, room.hostId)).limit(1);
    if (hostUser && hostUser.role !== "admin" && Number(hostUser.aiPoints || 0) <= 0) {
      console.log(`[runAgent] Host ${room.hostId} quota exhausted for shared provider. Skipping bot run.`);
      return null;
    }
  }

  let apiKey: string;
  try {
    apiKey = decrypt(aiConfig.apiKeyEncrypted);
  } catch {
    console.error(`[runAgent] Provider API key cannot be decrypted (key mismatch) — delete and re-create the provider.`);
    return null;
  }
  return { aiConfig, apiKey, endpoint: aiConfig.apiEndpoint };
}

/**
 * Pick the reply channel. A trigger names it; otherwise infer from recent
 * history whether the bot is in a DM and with whom. Falls back to the host.
 */
async function resolveReplyTarget(
  roomId: number,
  botUserId: number,
  hostId: number,
  triggeringInfo?: AgentTrigger
): Promise<{ replyIsPrivate: boolean; targetUserId: number | null }> {
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
        .where(messageVisibilityWhere(roomId, botUserId, false))
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
    targetUserId = hostId;
  }
  return { replyIsPrivate, targetUserId };
}

/**
 * Single envelope for everything the bot says in chat (free-text replies,
 * error/truncation notices). `lock` prefixes 🔒 in DMs — used by notices;
 * free-text replies render unprefixed, matching player messages.
 */
function makeSayAsBot({ roomId, botUserId, botNickname, replyIsPrivate, targetUserId }: AgentReplyTarget) {
  return (content: string, opts?: { lock?: boolean }) =>
    dispatchMessage({
      roomId,
      actorUserId: botUserId,
      nickname: botNickname,
      type: "text",
      audience: replyIsPrivate ? "dm" : "everyone",
      targetUserId: replyIsPrivate ? targetUserId : null,
      content: replyIsPrivate && opts?.lock ? `🔒 ${content}` : content,
    });
}

/** Start or stop the bot's typing indicator in the reply channel. */
function emitAgentTyping({ roomId, botUserId, botNickname, replyIsPrivate, targetUserId }: AgentReplyTarget, hostId: number, typing: boolean) {
  const typingEvent = {
    type: "typing",
    botUserId,
    nickname: botNickname,
    typing,
    isPrivate: replyIsPrivate,
    targetUserId: targetUserId,
    userId: botUserId
  };
  // Use targeted emit for private replies so other room members don't see the typing indicator
  if (replyIsPrivate && targetUserId) {
    emitToUser(roomId, targetUserId, typingEvent);
    if (targetUserId !== hostId) emitToUser(roomId, hostId, typingEvent);
  } else {
    broadcastToRoom(roomId, typingEvent);
  }
}

/**
 * The model↔tool loop. Appends to `currentContext` and adds each completion's
 * usage to `tokens` in place, so runAgent's finally bills whatever was spent
 * even if this throws partway.
 */
async function runAgentToolLoop({ model, tools, enabledTools, knownToolNames, currentContext, toolCtx, sayAsBot, endpoint, apiKey, tokens }: {
  model: string;
  tools: ReturnType<typeof buildAgentToolDefinitions>;
  enabledTools: string[];
  knownToolNames: string[];
  currentContext: AgentChatMessage[];
  toolCtx: AgentToolContext;
  sayAsBot: ReturnType<typeof makeSayAsBot>;
  endpoint: string;
  apiKey: string;
  tokens: TokenTally;
}) {
  const { botUserId, botNickname } = toolCtx;
  let iterations = 0;

  // Fetch the LLM completion
  while (iterations < MAX_AGENT_ITERATIONS) {
    iterations++;
    const isLastIteration = iterations === MAX_AGENT_ITERATIONS;

    let assistantMessage;
    let finishReason: string | undefined;
    try {
      const bodyPayload = {
        model,
        messages: currentContext,
        // Force-text on the final iteration: keep the tool definitions —
        // several backends (including Claude's OpenAI-compat endpoint)
        // reject requests whose history contains tool calls when no tools
        // are declared — but forbid new calls via tool_choice so the model
        // must wrap up in prose. Without this, tools called on the last
        // round produce side effects (dice broadcasts, item transfers)
        // whose results the model never sees and never gets to describe.
        ...(tools.length > 0
          ? { tools, ...(isLastIteration ? { tool_choice: "none" } : {}) }
          : {})
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
      
      // Record token usage (accumulated here, saved in runAgent's finally block)
      const usage = data.usage || {};
      tokens.inputTokens += usage.prompt_tokens || 0;
      tokens.cachedInputTokens += usage.prompt_tokens_details?.cached_tokens || 0;
      tokens.outputTokens += usage.completion_tokens || 0;

      assistantMessage = data.choices[0].message;
      finishReason = data.choices[0].finish_reason;
    } catch (err: unknown) {
      console.error(`[runAgent] completion error:`, err);
      await sayAsBot(`(${botNickname}) encountered an error connecting to AI: ${err instanceof Error ? err.message : String(err)}`, { lock: true });
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

    // A "length" finish means the reply hit the output token cap (there is
    // no max_tokens in the request, so the cap is the provider's default):
    // the prose is cut short and any tool_calls are likely half-emitted
    // JSON. An HTTP 200 with finish_reason "length" is not a success.
    const truncated = finishReason === "length";

    // If there is message text, broadcast it (R3) (filtered with sensitive words check)
    if (assistantMessage.content) {
      let textToSend = assistantMessage.content;
      const matchedWord = await checkSensitiveWords(textToSend);
      if (matchedWord) {
        console.warn(`[AI Sensitive Words] Bot ${botUserId} output matched sensitive word: ${matchedWord}. Redacting...`);
        textToSend = "(Output blocked due to sensitive content filter)";
      }
      // Flag truncation inside the same message rather than as a separate
      // notice, so a cut-off narration never reads as a finished one.
      if (truncated) {
        textToSend += "\n\n*(reply was cut off by the model's output limit)*";
      }
      await sayAsBot(textToSend);
    }

    if (truncated) {
      console.warn(`[runAgent] Bot ${botUserId} reply truncated by the model's output limit (finish_reason=length); stopping tool loop.`);
      if (!assistantMessage.content) {
        // 200 + empty content + "length" (a reasoning model burning the
        // whole cap on reasoning tokens) previously ended the run with no
        // message at all — typing stopped and nothing arrived.
        await sayAsBot(`(${botNickname}) reply was cut off by the model's output limit before any text was produced.`, { lock: true });
      }
      // Never execute tool calls from a truncated turn — their argument
      // JSON may be half-emitted.
      break;
    }

    // Any other terminal reason the loop doesn't model (content_filter,
    // relay-specific values) is not a success either: log it, and if the
    // turn produced nothing at all, say so instead of ending silently.
    if (finishReason && !["stop", "tool_calls"].includes(finishReason)) {
      console.warn(`[runAgent] Bot ${botUserId} completion ended with unexpected finish_reason=${finishReason}.`);
      if (!assistantMessage.content && !assistantMessage.tool_calls?.length) {
        await sayAsBot(`(${botNickname}) the model returned no reply (finish_reason: ${finishReason}).`, { lock: true });
        break;
      }
    }

    // If no tool calls, we are finished
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    // tool_choice "none" forbids calls on the final iteration, so tool_calls
    // here are a relay/model glitch — drop them rather than executing calls
    // whose results the model can never see, but never end the run silently.
    if (isLastIteration) {
      if (!assistantMessage.content) {
        await sayAsBot(`(${botNickname}) ran out of tool rounds before finishing a reply.`, { lock: true });
      }
      break;
    }

    const toolCallResults: AgentChatMessage[] = [];
    for (const toolCall of assistantMessage.tool_calls) {
      // Execute tool calls sequentially to avoid DB race conditions on concurrent writes.
      // Optional-chain the whole entry: a relay can emit a tool_calls item
      // with no `function` key (truncated / non-conformant shapes), and an
      // unguarded deref here throws past the loop's catch-less outer try.
      const functionName: string = toolCall?.function?.name ?? "";
      // Whitelist + argument guard: disabled/unknown tool names and malformed
      // argument JSON become readable tool-result errors instead of either
      // executing a tool the host turned off or throwing past the loop.
      const guard = resolveToolCall(functionName, toolCall?.function?.arguments ?? "", enabledTools, knownToolNames);
      if (!guard.ok) {
        toolCallResults.push({
          role: "tool",
          tool_call_id: toolCall?.id ?? "",
          content: capToolContent(JSON.stringify({ success: false, error: guard.error })),
        });
        continue;
      }
      const args = guard.args;
      let result;

      try {
        const handler = AGENT_TOOL_HANDLERS.get(functionName);
        result = handler ? await handler(args, toolCtx) : undefined;
      } catch (e: unknown) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }

      // Load-bearing drift net — NOT redundant with the guard: resolveToolCall
      // validates against the advertised definition list (allTools), not the
      // handler table. A tool defined without a handler (or a handler that
      // returns nothing) lands exactly here, and JSON.stringify(undefined) is
      // not a string. agent-tools.test.ts pins the two lists together.
      if (result === undefined) {
        console.error(`[runAgent] Tool "${functionName}" passed the whitelist but has no handler result — agent-tool-definitions and AGENT_TOOL_HANDLERS have drifted.`);
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
}

/**
 * runAgent
 * Orchestrates the LLM call and Tool execution.
 */
export async function runAgent(
  botUserId: number,
  roomId: number,
  triggeringInfo?: AgentTrigger
) {
  if (!checkAndConsumeCooldown(botUserId, triggeringInfo?.bypassCooldown)) return;

  const loaded = await loadAgentRunContext(roomId, botUserId);
  if (!loaded) return;
  const { room, botUser, member } = loaded;

  // Verify global AI switch
  if (!(await isAiGloballyEnabled(botUserId))) return;

  const botCfg = parseBotConfig(botUser.botConfigJson);

  const provider = await resolveAgentProvider(botUserId, room, botCfg);
  if (!provider) return;
  const { aiConfig, apiKey, endpoint } = provider;

  const { context, model } = await buildAgentContext(botUser, room, roomId, botUserId, botCfg);
  const enabledTools: string[] = botCfg.enableTools || ["roll_dice", "respond_check"];

  const allTools = buildAgentToolDefinitions(roomId);
  // Filter to only the tools enabled for this bot. Note: free-text replies are
  // broadcast directly from the model's message content (R3), so there is no
  // "send_message" tool — a bot can always talk without one being enabled.
  const tools = allTools.filter(t => enabledTools.includes(t.function.name));
  // The same whitelist is enforced again at execution time (resolveToolCall):
  // filtering the advertised definitions does not stop a model from emitting
  // a disabled or invented tool name.
  const knownToolNames = allTools.map(t => t.function.name);

  const currentContext: AgentChatMessage[] = [...context];

  const botNickname = member?.nickname || botUser?.displayName || "AI";

  const { replyIsPrivate, targetUserId } = await resolveReplyTarget(roomId, botUserId, room.hostId, triggeringInfo);
  const replyTarget: AgentReplyTarget = { roomId, botUserId, botNickname, replyIsPrivate, targetUserId };
  const sayAsBot = makeSayAsBot(replyTarget);

  emitAgentTyping(replyTarget, room.hostId, true);

  const toolCtx: AgentToolContext = { roomId, botUserId, botNickname, room, replyIsPrivate, targetUserId };

  // Created outside the try and filled in place by the loop, so the finally
  // bills tokens already spent even when the loop throws.
  const tokens: TokenTally = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

  try {
    await runAgentToolLoop({ model, tools, enabledTools, knownToolNames, currentContext, toolCtx, sayAsBot, endpoint, apiKey, tokens });
  } finally {
    if (tokens.inputTokens > 0 || tokens.outputTokens > 0) {
      recordTokenUsage(room.hostId, aiConfig.id, tokens.inputTokens, tokens.cachedInputTokens, tokens.outputTokens)
        .catch(err => console.error("[runAgent] Error saving accumulated token usage:", err));
    }
    emitAgentTyping(replyTarget, room.hostId, false);
  }

  // Trigger Incremental Summarization (Task #36)
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

  // Fetch ALL new rows (bounded by the (room_id, id) index + LIMIT) and
  // filter in memory below. The threshold and the cursor must track raw room
  // traffic, not the filtered subset: gating cursor advancement on a filtered
  // count let image/sticker-heavy rooms stall the cursor forever while the
  // context window scrolled past unsummarized history, and made every run
  // re-scan an ever-growing id range (visibility/type conditions are
  // post-index filters).
  const newMsgs = await db.select().from(messages)
    .where(and(eq(messages.roomId, roomId), gt(messages.id, lastId)))
    .orderBy(asc(messages.id))
    .limit(500);

  if (newMsgs.length < 30) return; // Threshold not met

  // Only rows the bot may see feed the external LLM — this text is sent
  // verbatim and the summary is persisted into the bot's system prompt, so
  // without the filter player-to-player DMs, GM-only notices, and hidden
  // rolls all leak. `canSee` is the audience model's pure predicate (bots are
  // never the room host). The bot's OWN rows are included regardless of type,
  // mirroring buildAgentContext, so the summary remembers the bot's handouts
  // (e.g. send_image posts) and not just its text replies.
  const summarizable = newMsgs.filter(m =>
    canSee(m, botUserId, false) &&
    (m.userId === botUserId || (BOT_READABLE_MESSAGE_TYPES as readonly string[]).includes(m.type))
  );

  // Nothing the bot may see in this batch (e.g. a burst of other players'
  // stickers): advance the cursor without paying for an LLM call so the next
  // scan starts past these rows.
  if (summarizable.length === 0) {
    config.lastSummarizedMsgId = newMsgs[newMsgs.length - 1].id;
    await db.update(users).set({ botConfigJson: JSON.stringify(config) }).where(eq(users.id, botUserId));
    return;
  }

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

  const msgText = summarizable.map(m => `[${m.nickname}]: ${m.content}`).join("\n");
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
