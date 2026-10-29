import { z } from 'zod';
import { ProtocolError } from './errors';
import type { Protocol, CompletionRequest, Wire } from './types';
const effort = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export const protocolConfigSchema = z.object({
  version: z.literal(1), protocol: z.enum(['chat', 'messages', 'responses', 'gemini']),
  endpointMode: z.enum(['base', 'full']).default('base'),
  auth: z.enum(['bearer', 'api-key', 'google-key', 'none']).optional(),
  model: z.string().min(1).optional(),
  stream: z.boolean().optional(),
  contextWindow: z.number().int().positive().max(100_000_000).optional(),
  multimodalInput: z.boolean().optional(),
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  outputTokenField: z.enum(['max_tokens', 'max_completion_tokens']).optional(),
  reasoning: z.object({ effort: effort.optional(), enabled: z.boolean().optional(), budgetTokens: z.number().int().positive().optional(), summary: z.enum(['auto', 'concise', 'detailed']).optional(), includeThoughts: z.boolean().optional(), display: z.enum(['summarized', 'omitted']).optional() }).strict().optional(),
  capabilities: z.object({
    tools: z.boolean().optional(), toolChoices: z.array(z.enum(['auto', 'none', 'required', 'named'])).optional(),
    effortMap: z.partialRecord(effort, z.union([z.string().min(1), z.number().int().nonnegative()])).optional(),
    thinkingDialect: z.enum(['thinking', 'enable_thinking', 'adaptive', 'budget', 'level']).optional(),
    reasoningReplay: z.enum(['preserve', 'omit']).optional(),
    temperature: z.boolean().optional(),
  }).strict().optional(),
}).strict();
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export interface Connection { protocol: Protocol; model: string; url: string; headers: Record<string, string>; source: string; config: ProtocolConfig }
export function parseProtocolConfig(value: unknown): ProtocolConfig {
  const result = protocolConfigSchema.safeParse(value ?? { version: 1, protocol: 'chat' });
  if (!result.success) throw new ProtocolError('config', 'Invalid LLM protocol configuration');
  return result.data;
}
export function resolveConnection(endpoint: string, apiKey: string, model: string, value?: unknown, providerId?: number, streaming = false): Connection {
  const config = parseProtocolConfig(value);
  if (config.model && config.model !== model) throw new ProtocolError('config', 'Protocol settings belong to a different model');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new ProtocolError('config', 'Invalid endpoint URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new ProtocolError('config', 'Endpoint must be an HTTPS URL without credentials, query or fragment');
  let path = url.pathname.replace(/\/+$/, '');
  const suffix = { chat: '/chat/completions', messages: '/messages', responses: '/responses', gemini: `/models/${encodeURIComponent(model.replace(/^models\//, ''))}:${streaming ? 'streamGenerateContent' : 'generateContent'}` }[config.protocol];
  if (config.endpointMode === 'full') {
    if (config.protocol === 'gemini') {
      if (!/\/models\/[^/]+:(generateContent|streamGenerateContent)$/.test(path)) throw new ProtocolError('config', 'Invalid full Gemini endpoint');
      const endpointModel = decodeURIComponent(path.match(/\/models\/([^/]+):/)![1]);
      if (endpointModel !== model.replace(/^models\//, '')) throw new ProtocolError('config', 'Endpoint model mismatch');
      path = path.replace(/:(generateContent|streamGenerateContent)$/, streaming ? ':streamGenerateContent' : ':generateContent');
    } else if (!path.endsWith(suffix)) throw new ProtocolError('config', 'Protocol and endpoint do not match');
  } else {
    if (/\/(chat\/completions|responses|messages)$|:generateContent$|:streamGenerateContent$/.test(path)) throw new ProtocolError('config', 'Use endpointMode full for a complete endpoint');
    if (config.protocol === 'messages' && !path.endsWith('/v1')) path += '/v1';
    if (config.protocol === 'gemini' && !/\/v1(beta)?$/.test(path)) path += '/v1beta';
    path += suffix;
  }
  url.pathname = path;
  if (config.protocol === 'gemini' && streaming) url.searchParams.set('alt', 'sse');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = config.auth ?? (config.protocol === 'messages' ? 'api-key' : config.protocol === 'gemini' ? 'google-key' : 'bearer');
  if (auth !== 'none' && !apiKey.trim()) throw new ProtocolError('config', 'API key is required');
  if (auth === 'bearer') headers.Authorization = `Bearer ${apiKey}`;
  if (auth === 'api-key') headers['x-api-key'] = apiKey;
  if (auth === 'google-key') headers['x-goog-api-key'] = apiKey;
  if (config.protocol === 'messages') headers['anthropic-version'] = '2023-06-01';
  return { protocol: config.protocol, model, url: url.toString(), headers, config, source: JSON.stringify([providerId ?? null, endpoint.replace(/\/+$/, ''), config.protocol, model]) };
}
/** Explicit configuration is the capability evidence. Unknown/unset parameters are never injected. */
export function reasoningBody(config: ProtocolConfig, request: CompletionRequest): Wire {
  const r = request.reasoning ?? config.reasoning;
  if (!r) return {};
  if (!protocolConfigSchema.shape.reasoning.safeParse(r).success) throw new ProtocolError('request', 'Invalid reasoning settings');
  if ((r.summary !== undefined && config.protocol !== 'responses') || (r.includeThoughts !== undefined && config.protocol !== 'gemini') || (r.display !== undefined && config.protocol !== 'messages')) throw new ProtocolError('request', 'Reasoning output option does not match protocol');
  const caps = config.capabilities;
  const mapped = r.effort === undefined ? undefined : caps?.effortMap?.[r.effort];
  if (r.effort !== undefined && mapped === undefined) throw new ProtocolError('request', 'Unsupported or undeclared reasoning effort');
  const dialect = caps?.thinkingDialect;
  if (r.enabled === false && r.effort && r.effort !== 'off') throw new ProtocolError('request', 'Disabled thinking conflicts with effort');
  if (config.protocol === 'chat' && dialect && !['thinking', 'enable_thinking'].includes(dialect)) throw new ProtocolError('request', 'Invalid Chat thinking dialect');
  if (config.protocol === 'messages' && dialect && !['thinking', 'adaptive', 'budget'].includes(dialect)) throw new ProtocolError('request', 'Invalid Messages thinking dialect');
  if (mapped !== undefined && typeof mapped !== (dialect === 'budget' ? 'number' : 'string')) throw new ProtocolError('request', 'Invalid effort mapping type');
  if (r.budgetTokens !== undefined && dialect !== 'budget') throw new ProtocolError('request', 'Budget requires a budget dialect');
  if (dialect === 'enable_thinking' && r.effort && r.effort !== 'off') throw new ProtocolError('request', 'Switch-only thinking does not support effort');
  const enabled = r.enabled ?? (r.effort === undefined ? undefined : r.effort !== 'off');
  if ((r.enabled !== undefined || r.budgetTokens !== undefined) && !dialect) throw new ProtocolError('request', 'Thinking control requires a declared dialect');
  if (config.protocol === 'chat') {
    if (r.budgetTokens !== undefined) throw new ProtocolError('request', 'Chat thinking budgets are not declared');
    return { ...(mapped !== undefined && !(dialect && enabled === false) ? { reasoning_effort: mapped } : {}), ...(dialect === 'thinking' && enabled !== undefined ? { thinking: { type: enabled ? 'enabled' : 'disabled' } } : {}), ...(dialect === 'enable_thinking' && enabled !== undefined ? { enable_thinking: enabled } : {}) };
  }
  if (config.protocol === 'responses') {
    if (r.enabled !== undefined || r.budgetTokens !== undefined) throw new ProtocolError('request', 'Responses uses declared effort values');
    return mapped !== undefined || r.summary !== undefined ? { reasoning: { ...(mapped !== undefined ? { effort: mapped } : {}), ...(r.summary ? { summary: r.summary } : {}) } } : {};
  }
  if (config.protocol === 'messages') {
    if (r.display && !dialect) throw new ProtocolError('request', 'Thinking display requires a declared dialect');
    const thinking = enabled === false ? { type: 'disabled' } : dialect === 'budget' ? { type: 'enabled', budget_tokens: r.budgetTokens ?? mapped } : dialect === 'thinking' ? { type: 'enabled' } : { type: 'adaptive' };
    if (dialect === 'budget' && enabled !== false && !(Number(thinking.budget_tokens) > 0)) throw new ProtocolError('request', 'Thinking budget is required');
    return { ...(dialect ? { thinking: { ...thinking, ...(r.display && enabled !== false ? { display: r.display } : {}) } } : {}), ...(mapped !== undefined && dialect !== 'budget' && enabled !== false ? { output_config: { effort: mapped } } : {}) };
  }
  if (r.includeThoughts !== undefined && r.effort === undefined && r.enabled === undefined && r.budgetTokens === undefined) return { thinkingConfig: { includeThoughts: r.includeThoughts } };
  const thinkingConfig = dialect === 'budget' ? { thinkingBudget: enabled === false ? 0 : r.budgetTokens ?? mapped } : { thinkingLevel: mapped };
  if (!dialect || (dialect !== 'budget' && dialect !== 'level') || Object.values(thinkingConfig).some(v => v === undefined)) throw new ProtocolError('request', 'Gemini thinking requires a declared level or budget');
  return { thinkingConfig: { ...thinkingConfig, ...(r.includeThoughts !== undefined ? { includeThoughts: r.includeThoughts } : {}) } };
}
