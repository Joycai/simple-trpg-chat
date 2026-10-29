import 'server-only';
import { z } from 'zod';
import type { Completion, CompletionEvent, CompletionRequest, Usage } from './types';
import type { Connection } from './config';
import { reasoningBody } from './config';
import { ProtocolError } from './errors';
import { object, validateCalls } from './wire';
import { mergeUsage, normalizeUsage } from './usage';
import { readJson, readSse, requestHttp } from './transport';
import { chat } from './adapters/chat';
import { messages } from './adapters/messages';
import { responses } from './adapters/responses';
import { gemini } from './adapters/gemini';
const adapters = { chat, messages, responses, gemini };
const messageSchema = z.object({ role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']), content: z.string().nullable().optional(), name: z.string().optional(), tool_call_id: z.string().optional(), tool_calls: z.array(z.object({ id: z.string().min(1), type: z.literal('function'), function: z.object({ name: z.string().min(1), arguments: z.string() }) })).optional(), continuation: z.object({ source: z.string(), payload: z.unknown() }).optional() }).strict();
export function validateRequest(r: CompletionRequest, c: Connection) {
  if (!r.model?.trim() || !r.messages.length) throw new ProtocolError('request', 'Model and messages are required');
  if (r.model !== c.model) throw new ProtocolError('request', 'Request model does not match connection');
  if ((r.timeoutMs !== undefined && (!Number.isFinite(r.timeoutMs) || r.timeoutMs <= 0 || r.timeoutMs > 2147483647)) || (r.deadlineMs !== undefined && !Number.isFinite(r.deadlineMs))) throw new ProtocolError('request', 'Invalid request deadline');
  const pending = new Set<string>(), seen = new Set<string>();
  for (const m of r.messages) {
    if (!messageSchema.safeParse(m).success) throw new ProtocolError('request', 'Invalid message');
    if ((m.continuation && m.role !== 'assistant') || (m.tool_calls && m.role !== 'assistant') || (m.tool_call_id && m.role !== 'tool')) throw new ProtocolError('request', 'Message fields do not match role');
    if (m.continuation && m.continuation.source !== c.source) throw new ProtocolError('request', 'Continuation belongs to another route or model');
    if (m.role === 'tool') {
      if (!m.tool_call_id || !pending.delete(m.tool_call_id)) throw new ProtocolError('request', 'Unmatched tool result');
    } else {
      if (pending.size) throw new ProtocolError('request', 'Missing tool result');
      if (m.tool_calls?.length) {
        if (m.role !== 'assistant') throw new ProtocolError('request', 'Only assistant messages can call tools');
        validateCalls(m.tool_calls);
        for (const call of m.tool_calls) { if (seen.has(call.id)) throw new ProtocolError('request', 'Duplicate tool id'); pending.add(call.id); seen.add(call.id); }
      }
    }
  }
  if (pending.size) throw new ProtocolError('request', 'Unclosed tool calls');
  const names = new Set<string>();
  for (const t of r.tools ?? []) {
    if (t.type !== 'function' || !/^[a-zA-Z0-9_-]{1,64}$/.test(t.function.name) || t.function.parameters.type !== 'object' || names.has(t.function.name)) throw new ProtocolError('request', 'Invalid tool definition');
    names.add(t.function.name);
  }
  const caps = c.config.capabilities;
  if (caps?.tools === false && r.tools?.length) throw new ProtocolError('request', 'Tools are unsupported');
  if (r.toolChoice) {
    const choice = typeof r.toolChoice === 'string' ? r.toolChoice : 'named';
    if (!r.tools?.length || (caps?.toolChoices && !caps.toolChoices.includes(choice)) || (typeof r.toolChoice === 'object' && !names.has(r.toolChoice.name))) throw new ProtocolError('request', 'Unsupported tool choice');
  }
  if (r.maxOutputTokens !== undefined && (!Number.isInteger(r.maxOutputTokens) || r.maxOutputTokens <= 0)) throw new ProtocolError('request', 'Invalid output token budget');
  if (r.temperature !== undefined && (!Number.isFinite(r.temperature) || r.temperature < 0 || r.temperature > 2 || caps?.temperature === false)) throw new ProtocolError('request', 'Unsupported temperature');
}
export interface Attempt { attemptId: string; model: string; protocol: Connection['protocol']; status: string; usage: Usage }
export type ObserveAttempt = (attempt: Attempt) => Promise<void>;
/** One logical generation; only pre-generation HTTP failures may be retried. */
export async function* streamCompletion(connection: Connection, input: CompletionRequest, observe?: ObserveAttempt): AsyncGenerator<CompletionEvent> {
  const attemptId = crypto.randomUUID(), adapter = adapters[connection.protocol];
  const r = { ...input, temperature: input.temperature ?? (connection.config.capabilities?.temperature === false ? undefined : input.defaultTemperature), maxOutputTokens: input.maxOutputTokens ?? connection.config.maxOutputTokens };
  const activeReasoning = r.reasoning ?? connection.config.reasoning;
  if (connection.protocol === 'messages' && activeReasoning && activeReasoning.enabled !== false && activeReasoning.effort !== 'off') {
    if (input.temperature !== undefined) throw new ProtocolError('request', 'Temperature conflicts with Messages thinking');
    r.temperature = undefined;
  }
  validateRequest(r, connection);
  const body = adapter.build(r, connection.source), thinking = reasoningBody(connection.config, r);
  if (connection.protocol === 'gemini') body.generationConfig = { ...object(body.generationConfig), ...thinking };
  else Object.assign(body, thinking);
  if (connection.protocol === 'chat' && connection.config.outputTokenField === 'max_completion_tokens' && body.max_tokens) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; }
  if (connection.config.capabilities?.reasoningReplay === 'omit' && connection.protocol === 'chat') for (const m of body.messages as Record<string, unknown>[]) { delete m.reasoning; delete m.reasoning_content; delete m.reasoning_details; delete m.encrypted_content; }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 8 * 1024 * 1024) throw new ProtocolError('request', 'AI request exceeded size limit');
  // Extended thinking budgets must fit within the total output allowance.
  if (connection.protocol === 'messages' && Number(object(body.thinking).budget_tokens) >= Number(body.max_tokens)) throw new ProtocolError('request', 'Thinking budget must be smaller than output budget');
  const controller = new AbortController();
  const remaining = input.deadlineMs === undefined ? Infinity : input.deadlineMs - Date.now();
  const timeout = Math.min(input.timeoutMs ?? 120000, remaining);
  if (!(timeout > 0)) throw new ProtocolError('timeout', 'AI request deadline exceeded');
  const timer = setTimeout(() => controller.abort(new ProtocolError('timeout', 'AI request timed out')), timeout);
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  const accumulator = adapter.accumulator(); let lastUsage = ''; let usage = normalizeUsage(connection.protocol), status = 'failed';
  try {
    const response = await requestHttp(connection.url, { method: 'POST', headers: connection.headers, body: JSON.stringify(body) }, signal);
    let data: unknown;
    if (r.stream) {
      for await (const item of readSse(response, signal)) {
        // Capture usage even if this very event also carries an error.
        const raw = connection.protocol === 'gemini' ? item.usageMetadata : connection.protocol === 'responses' ? object(item.response).usage : item.usage ?? object(item.message).usage;
        if (raw) usage = normalizeUsage(connection.protocol, mergeUsage(usage.raw, object(raw)));
        yield* accumulator.push(item);
        usage = normalizeUsage(connection.protocol, mergeUsage(usage.raw, accumulator.usage()));
        if (usage.status !== 'missing' && JSON.stringify(usage) !== lastUsage) { lastUsage = JSON.stringify(usage); yield { type: 'usage', usage }; }
      }
      data = accumulator.finish();
    } else {
      data = await readJson(response, signal);
      usage = normalizeUsage(connection.protocol, object(object(data)[connection.protocol === 'gemini' ? 'usageMetadata' : 'usage']));
    }
    const result: Completion = { ...adapter.parse(data, connection.source), attemptId };
    usage = result.usage; status = result.status;
    validateCalls(result.message.tool_calls ?? [], result.status === 'tool_calls');
    if (result.status === 'completed' && !result.message.content?.trim()) result.status = 'incomplete';
    status = result.status;
    if (usage.status !== 'missing' && JSON.stringify(usage) !== lastUsage) yield { type: 'usage', usage };
    if (result.status === 'tool_calls') for (const call of result.message.tool_calls ?? []) yield { type: 'tool_call', call };
    yield { type: 'done', result };
  } catch (error) {
    const failure = signal.aborted ? (input.signal?.aborted ? new ProtocolError('cancelled', 'AI request cancelled') : new ProtocolError('timeout', 'AI request timed out')) : error instanceof ProtocolError ? error : new ProtocolError('response', 'Invalid AI response');
    if (failure.rawUsage && Object.keys(failure.rawUsage).length) usage = normalizeUsage(connection.protocol, failure.rawUsage);
    failure.usage = usage; status = failure.code; throw failure;
  } finally {
    clearTimeout(timer); controller.abort();
    // Accounting failures must not hide a delivered result. The observer owns durable retries.
    if (observe) { try { await observe({ attemptId, model: input.model, protocol: connection.protocol, status, usage }); } catch { console.error('[AI usage] Failed to persist attempt', attemptId); } }
  }
}
export async function complete(connection: Connection, request: CompletionRequest, observe?: ObserveAttempt): Promise<Completion> {
  let result: Completion | undefined;
  for await (const event of streamCompletion(connection, request, observe)) if (event.type === 'done') result = event.result;
  if (!result) throw new ProtocolError('response', 'Missing completion');
  return result;
}
