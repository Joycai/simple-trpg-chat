/**
 * 投娘（掷骰播报 Bot）— design: docs/design/dice-announcer.md.
 *
 * A room may designate one of its bots as the "announcer": every dice roll's
 * card is re-skinned with that bot's visual identity plus a short quip. The
 * message itself never changes ownership (`actorUserId` stays the roller) —
 * only `diceDetail.announcer` is tagged, mirroring the `proxiedBy*` pattern
 * in commands.ts's `attachProxy`.
 *
 * Deliberately does NOT reuse `runAgent`/`parseBotConfig`/`fetchWithBackoff`
 * from ai_agent.ts: that module imports `executeCommand` from commands.ts,
 * and commands.ts imports this module — importing ai_agent.ts here would
 * create a cycle. This module keeps its own minimal config parse + single
 * fetch call (no retries — a missed quip isn't worth burning provider quota).
 */
import { db } from "@/db";
import { rooms, users, roomMembers, messages, aiProviders, systemConfig } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { broadcastToRoom } from "@/lib/events";
import { decrypt } from "@/lib/encryption";
import { checkSensitiveWords } from "@/lib/sensitive-words";
import { recordTokenUsage } from "@/lib/ai_usage";
import { validateApiEndpoint } from "@/lib/url-guard";
import { getTranslations } from "next-intl/server";
import type { VisualGrade } from "@/lib/rules";

// ---------------------------------------------------------------------------
// Announcer resolution
// ---------------------------------------------------------------------------

export interface AnnouncerInfo {
  botUserId: number;
  nickname: string;
  botConfigJson: string | null;
}

/**
 * Resolve the room's announcer bot for a given roller, or null when the
 * feature doesn't apply. Kept to at most two queries: a PK lookup that lets
 * the (overwhelmingly common) "announcer off" case short-circuit before
 * touching `users`/`roomMembers` at all, then one combined lookup covering
 * both the announcer bot and the roller (so a bot-rolling-for-a-bot never
 * announces itself).
 */
export async function resolveAnnouncer(roomId: number, rollerUserId: number): Promise<AnnouncerInfo | null> {
  const [room] = await db
    .select({ diceAnnouncerBotId: rooms.diceAnnouncerBotId })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  const botId = room?.diceAnnouncerBotId;
  if (!botId) return null;

  const ids = botId === rollerUserId ? [botId] : [botId, rollerUserId];
  const rows = await db
    .select({
      userId: users.id,
      isBot: users.isBot,
      botConfigJson: users.botConfigJson,
      nickname: roomMembers.nickname,
    })
    .from(users)
    .leftJoin(roomMembers, and(eq(roomMembers.userId, users.id), eq(roomMembers.roomId, roomId)))
    .where(inArray(users.id, ids));

  const rollerRow = rows.find((r) => r.userId === rollerUserId);
  if (rollerRow?.isBot) return null; // any bot roller skips announcing — no self-congratulation

  const botRow = rows.find((r) => r.userId === botId);
  if (!botRow || !botRow.isBot || !botRow.nickname) return null; // deleted/demoted/left the room

  return { botUserId: botRow.userId, nickname: botRow.nickname, botConfigJson: botRow.botConfigJson };
}

// ---------------------------------------------------------------------------
// diceDetail tagging — pure, mirrors commands.ts's attachProxy
// ---------------------------------------------------------------------------

export interface AnnouncerTag {
  userId: number;
  nickname: string;
  quip?: string;
  quipPending?: boolean;
}

/** Tag a diceDetail JSON string with the announcer's identity (quip pending). */
export function attachAnnouncer(detailJson: string, announcer: AnnouncerInfo): string {
  try {
    const obj = JSON.parse(detailJson) as Record<string, unknown>;
    obj.announcer = { userId: announcer.botUserId, nickname: announcer.nickname, quipPending: true } satisfies AnnouncerTag;
    return JSON.stringify(obj);
  } catch {
    return detailJson;
  }
}

/**
 * Merge a resolved quip into a previously-tagged diceDetail JSON string.
 * Returns null when the row has no `announcer` tag (or fails to parse) so
 * the caller can silently abandon the patch instead of writing garbage.
 */
export function mergeQuip(detailJson: string, quip: string): string | null {
  try {
    const obj = JSON.parse(detailJson) as { announcer?: AnnouncerTag };
    if (!obj.announcer) return null;
    obj.announcer.quip = quip;
    delete obj.announcer.quipPending;
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker (per bot) — globalThis per CLAUDE.md's multi-worker rule
// ---------------------------------------------------------------------------

export interface BreakerState {
  fails: number;
  openUntil: number;
}

const BREAKER_FAIL_THRESHOLD = 3;
const BREAKER_OPEN_MS = 5 * 60 * 1000;

declare global {
  var __quipBreaker: Map<number, BreakerState> | undefined;
}
const quipBreaker: Map<number, BreakerState> = globalThis.__quipBreaker ?? new Map();
globalThis.__quipBreaker = quipBreaker;

/** Pure: is the breaker currently open (LLM attempts should be skipped)? */
export function isBreakerOpen(state: BreakerState | undefined, now: number): boolean {
  return !!state && state.openUntil > now;
}

/** Pure state transition: fold one LLM attempt's outcome into breaker state. */
export function recordBreakerResult(state: BreakerState | undefined, success: boolean, now: number): BreakerState {
  if (success) return { fails: 0, openUntil: 0 };
  const fails = (state?.fails ?? 0) + 1;
  if (fails >= BREAKER_FAIL_THRESHOLD) {
    return { fails, openUntil: now + BREAKER_OPEN_MS };
  }
  return { fails, openUntil: state?.openUntil ?? 0 };
}

// ---------------------------------------------------------------------------
// Rate limiting (per room) — token bucket, globalThis-backed
// ---------------------------------------------------------------------------

export interface BucketState {
  tokens: number;
  lastRefill: number;
}

const BUCKET_CAPACITY = 3;
const BUCKET_REFILL_MS = 2000; // 1 token / 2s

declare global {
  var __quipBucket: Map<number, BucketState> | undefined;
}
const quipBucket: Map<number, BucketState> = globalThis.__quipBucket ?? new Map();
globalThis.__quipBucket = quipBucket;

/** Pure: refill then attempt to take one token. Returns [allowed, nextState]. */
export function takeToken(state: BucketState | undefined, now: number): [boolean, BucketState] {
  const prev = state ?? { tokens: BUCKET_CAPACITY, lastRefill: now };
  const elapsedTicks = Math.max(0, Math.floor((now - prev.lastRefill) / BUCKET_REFILL_MS));
  const tokens = Math.min(BUCKET_CAPACITY, prev.tokens + elapsedTicks);
  const lastRefill = elapsedTicks > 0 ? prev.lastRefill + elapsedTicks * BUCKET_REFILL_MS : prev.lastRefill;
  if (tokens <= 0) return [false, { tokens, lastRefill }];
  return [true, { tokens: tokens - 1, lastRefill }];
}

// ---------------------------------------------------------------------------
// Quip pool fallback — pure selection, i18n lookup happens at the call site
// ---------------------------------------------------------------------------

export type QuipGroup = "critical" | "success" | "failure" | "fumble" | "plain";

/** Map a rule's VisualGrade (or none, for plain expression rolls) to a pool group. */
export function gradeToQuipGroup(grade: VisualGrade | null | undefined): QuipGroup {
  return grade ?? "plain";
}

/** Pure random pick; `rng` is injected so tests can pin the outcome. */
export function pickPoolQuip(pool: readonly string[], rng: () => number = Math.random): string | null {
  if (!pool.length) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}

async function poolQuip(grade: VisualGrade | null | undefined): Promise<string> {
  const group = gradeToQuipGroup(grade);
  const t = await getTranslations("diceAnnouncer");
  const pool = ((t as unknown as { raw: (key: string) => unknown }).raw(`quips.${group}`) as string[]) || [];
  return pickPoolQuip(pool) ?? "……";
}

// ---------------------------------------------------------------------------
// LLM quip generation
// ---------------------------------------------------------------------------

/** The handful of BotConfig fields the announcer pipeline needs — kept local, see file header. */
function parseAnnouncerBotConfig(json: string | null | undefined): { providerId?: number; model: string; systemPrompt: string } {
  const fallback = { model: "gpt-4o", systemPrompt: "You are an AI assistant in a TRPG session." };
  if (!json) return fallback;
  try {
    const raw = JSON.parse(json);
    return {
      providerId: typeof raw.providerId === "number" ? raw.providerId : undefined,
      model: typeof raw.model === "string" && raw.model ? raw.model : fallback.model,
      systemPrompt: typeof raw.systemPrompt === "string" && raw.systemPrompt ? raw.systemPrompt : fallback.systemPrompt,
    };
  } catch {
    return fallback;
  }
}

const QUIP_LLM_TIMEOUT_MS = 2500;
const QUIP_MAX_TOKENS = 80;
const QUIP_MAX_CHARS = 60;

export interface RollSummary {
  rollerNickname: string;
  skillName?: string | null;
  notation: string;
  resultText: string;
  grade?: VisualGrade | null;
  hidden: boolean;
}

function gradeLabel(grade: VisualGrade | null | undefined): string {
  switch (grade) {
    case "critical": return "大成功";
    case "fumble": return "大失败";
    case "success": return "成功";
    case "failure": return "失败";
    default: return "";
  }
}

async function tryLlmQuip(announcer: AnnouncerInfo, roomId: number, roll: RollSummary): Promise<string | null> {
  const cfg = parseAnnouncerBotConfig(announcer.botConfigJson);
  if (!cfg.providerId) return null;

  const [globalAiConfig] = await db.select().from(systemConfig).where(eq(systemConfig.key, "ai_enabled"));
  if (globalAiConfig?.value !== "true") return null;

  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, cfg.providerId));
  if (!provider) return null;

  const [room] = await db.select({ hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, roomId));
  if (!room) return null;

  if (provider.ownerId !== room.hostId && !provider.isShared) return null;

  if (provider.isShared) {
    const [hostUser] = await db.select({ role: users.role, aiPoints: users.aiPoints }).from(users).where(eq(users.id, room.hostId));
    if (hostUser && hostUser.role !== "admin" && Number(hostUser.aiPoints || 0) <= 0) return null;
  }

  let apiKey: string;
  try {
    apiKey = decrypt(provider.apiKeyEncrypted);
  } catch {
    return null;
  }

  const url = `${provider.apiEndpoint}/chat/completions`;
  const endpointCheck = await validateApiEndpoint(url);
  if (!endpointCheck.valid) return null;

  const systemPrompt =
    `${cfg.systemPrompt}\n\n你是掷骰播报员。用一句话（≤40字）点评这次掷骰结果，符合你的人设。` +
    `只输出这一句话，不要复述数字以外的编造内容。使用与玩家相同的语言。`;
  const resultLabel = gradeLabel(roll.grade);
  const userPrompt =
    `玩家「${roll.rollerNickname}」投掷 ${roll.skillName ? roll.skillName + " " : ""}${roll.notation}，` +
    `结果：${roll.resultText}${resultLabel ? `（${resultLabel}）` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUIP_LLM_TIMEOUT_MS);
  let ok = false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: QUIP_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;

    const usage = data?.usage || {};
    recordTokenUsage(
      room.hostId,
      provider.id,
      usage.prompt_tokens || 0,
      usage.prompt_tokens_details?.cached_tokens || 0,
      usage.completion_tokens || 0
    ).catch((err) => console.error("[dice-announcer] recordTokenUsage failed:", err));

    const cleaned = content.trim().slice(0, QUIP_MAX_CHARS);
    const hit = await checkSensitiveWords(cleaned);
    if (hit) return null;

    ok = true;
    return cleaned;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    const prev = quipBreaker.get(announcer.botUserId);
    quipBreaker.set(announcer.botUserId, recordBreakerResult(prev, ok, Date.now()));
  }
}

// ---------------------------------------------------------------------------
// Two-phase delivery: attach the tag synchronously, generate + patch async
// ---------------------------------------------------------------------------

export interface QuipContext {
  roomId: number;
  messageId: number;
  announcer: AnnouncerInfo;
  roll: RollSummary;
}

/**
 * Fire-and-forget quip pipeline: rate limit → circuit breaker → LLM → pool
 * fallback → write back + broadcast. Never throws — every failure mode
 * degrades to a pool quip so the announcer card always ends up with *some*
 * line (§9 of the design doc's degradation matrix).
 */
export async function scheduleQuip(ctx: QuipContext): Promise<void> {
  const now = Date.now();
  const [allowed, bucketState] = takeToken(quipBucket.get(ctx.roomId), now);
  quipBucket.set(ctx.roomId, bucketState);

  let quip: string | null = null;
  if (allowed && !isBreakerOpen(quipBreaker.get(ctx.announcer.botUserId), now)) {
    quip = await tryLlmQuip(ctx.announcer, ctx.roomId, ctx.roll);
  }
  if (!quip) {
    quip = await poolQuip(ctx.roll.grade);
  }

  await patchQuip(ctx.roomId, ctx.messageId, quip);
}

/**
 * Defensive re-read/patch, mirroring ai_agent.ts's respond_check pattern:
 * re-fetch the row (it may have changed since dispatch), re-parse
 * diceDetail, merge the quip, write back. Any failure is abandoned silently
 * — a missing quip patch just means the placeholder times out client-side.
 */
async function patchQuip(roomId: number, messageId: number, quip: string): Promise<void> {
  const [row] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!row?.diceDetail) return;

  const merged = mergeQuip(row.diceDetail, quip);
  if (!merged) return;

  await db.update(messages).set({ diceDetail: merged }).where(eq(messages.id, messageId));

  broadcastToRoom(roomId, {
    type: "dice_quip_update",
    // Not `id` — the SSE route dedupes by `id` and the original message
    // already claimed this one on this stream (see events/route.ts).
    messageId,
    quip,
    audience: row.audience,
    userId: row.userId,
    targetUserId: row.targetUserId,
  });
}
