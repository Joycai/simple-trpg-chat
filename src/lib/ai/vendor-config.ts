import { z } from 'zod';
import { protocolConfigSchema, parseProtocolConfig, resolveConnection, reasoningBody, type ProtocolConfig } from './protocol/config';
import type { Protocol } from './protocol/types';
export const PROTOCOLS = ['chat', 'responses', 'messages', 'gemini'] as const;
export const PROTOCOL_LABELS: Record<Protocol, string> = { chat: 'Chat Completions', responses: 'Responses', messages: 'Messages', gemini: 'Gemini' };
export const EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const routeSchema = z.object({
  protocol: z.enum(PROTOCOLS), endpoint: z.string().trim().min(1).max(2048),
  endpointMode: z.enum(['base', 'full']).default('base'),
  auth: z.enum(['bearer', 'api-key', 'google-key', 'none']).optional(),
}).strict();
export type VendorRoute = z.infer<typeof routeSchema>;
export const vendorSchema = z.object({
  name: z.string().trim().min(1).max(120), platform: z.string().trim().min(1).max(80),
  apiKey: z.string().max(8192).optional(), routes: z.array(routeSchema).min(1).max(4),
}).strict().refine(v => new Set(v.routes.map(r => r.protocol)).size === v.routes.length, 'Duplicate protocol');
export const modelSchema = z.object({
  name: z.string().trim().min(1).max(120), model: z.string().trim().min(1).max(200),
  protocol: z.enum(PROTOCOLS), settings: z.partialRecord(z.enum(PROTOCOLS), protocolConfigSchema),
  isShared: z.boolean(), tokenRateInput: z.number().finite().min(0).max(1e6),
  tokenRateCached: z.number().finite().min(0).max(1e6), tokenRateOutput: z.number().finite().min(0).max(1e6),
}).strict();
export type ModelData = z.infer<typeof modelSchema>;
export type VendorData = z.infer<typeof vendorSchema>;
export function modelConnection(routes: VendorRoute[], data: ModelData): { apiEndpoint: string; protocolConfig: ProtocolConfig } {
  const route = routes.find(r => r.protocol === data.protocol);
  if (!route) throw new Error('routeInUse');
  const settings = data.settings[data.protocol] ?? { version: 1, protocol: data.protocol };
  if (settings.protocol !== data.protocol) throw new Error('invalid');
  const protocolConfig = parseProtocolConfig({ ...settings, model: data.model, endpointMode: route.endpointMode, auth: route.auth });
  resolveConnection(route.endpoint, 'validation-only', data.model, protocolConfig);
  const body = reasoningBody(protocolConfig, { model: data.model, messages: [] });
  if (data.protocol === 'messages' && Number((body.thinking as { budget_tokens?: number } | undefined)?.budget_tokens) >= (protocolConfig.maxOutputTokens ?? 4096)) throw new Error('budgetExceedsMaxOutput');
  if (protocolConfig.contextWindow && protocolConfig.maxOutputTokens && protocolConfig.maxOutputTokens > protocolConfig.contextWindow) throw new Error('maxOutputExceedsContext');
  return { apiEndpoint: route.endpoint, protocolConfig };
}
/** Switching never copies protocol-specific settings. Previously configured routes survive. */
export function settingsForProtocol(settings: Partial<Record<Protocol, ProtocolConfig>>, protocol: Protocol): ProtocolConfig {
  return settings[protocol] ?? { version: 1, protocol, endpointMode: 'base' };
}
export function presetRoutes(platform: string): VendorRoute[] {
  const route = (protocol: Protocol, endpoint: string, auth?: VendorRoute['auth']): VendorRoute => ({ protocol, endpoint, endpointMode: 'base', ...(auth ? { auth } : {}) });
  switch (platform) {
    case 'openai': return [route('chat', 'https://api.openai.com/v1'), route('responses', 'https://api.openai.com/v1')];
    case 'openrouter': return [route('chat', 'https://openrouter.ai/api/v1'), route('responses', 'https://openrouter.ai/api/v1')];
    case 'qwen': return [route('chat', 'https://dashscope.aliyuncs.com/compatible-mode/v1'), route('responses', 'https://dashscope.aliyuncs.com/compatible-mode/v1'), route('messages', 'https://dashscope.aliyuncs.com/apps/anthropic', 'bearer')];
    case 'qwen-token-plan': return [route('chat', 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'), route('responses', 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'), route('messages', 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic', 'bearer')];
    case 'volcengine': return [route('chat', 'https://ark.cn-beijing.volces.com/api/v3'), route('responses', 'https://ark.cn-beijing.volces.com/api/v3'), route('messages', 'https://ark.cn-beijing.volces.com/api/compatible', 'bearer')];
    case 'volcengine-agent-plan': return [route('chat', 'https://ark.cn-beijing.volces.com/api/plan/v3'), route('responses', 'https://ark.cn-beijing.volces.com/api/plan/v3'), route('messages', 'https://ark.cn-beijing.volces.com/api/plan', 'bearer')];
    case 'deepseek': return [route('chat', 'https://api.deepseek.com'), route('messages', 'https://api.deepseek.com/anthropic')];
    case 'anthropic': return [route('messages', 'https://api.anthropic.com/v1')];
    case 'google': return [route('gemini', 'https://generativelanguage.googleapis.com/v1beta'), route('chat', 'https://generativelanguage.googleapis.com/v1beta/openai')];
    default: return [route('chat', '')];
  }
}

export function validateVendorRoute(route: VendorRoute) {
  const bound = route.protocol === 'gemini' && route.endpointMode === 'full'
    ? decodeURIComponent(new URL(route.endpoint).pathname.match(/\/models\/([^/]+):/)?.[1] ?? '') : 'validation-model';
  return resolveConnection(route.endpoint, 'validation-only', bound, { version: 1, protocol: route.protocol, endpointMode: route.endpointMode, auth: route.auth });
}

function cleanEffortMap(map?: Partial<Record<typeof EFFORTS[number], string | number>>) {
  if (!map) return undefined;
  const cleaned: Partial<Record<typeof EFFORTS[number], string | number>> = {};
  for (const [k, v] of Object.entries(map) as [typeof EFFORTS[number], string | number | undefined][]) {
    if (v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    cleaned[k] = v;
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

/** Update or clear a single effort mapping without leaving empty strings trapped in state. */
export function setEffortMapping(config: ProtocolConfig, effort: typeof EFFORTS[number], value: string | number | undefined): ProtocolConfig {
  const nextMap = { ...config.capabilities?.effortMap };
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    delete nextMap[effort];
  } else {
    nextMap[effort] = value;
  }
  const effortMap = cleanEffortMap(nextMap);
  const capabilities = { ...config.capabilities, effortMap };
  const hasCaps = Object.values(capabilities).some(v => v !== undefined);
  return { ...config, capabilities: hasCaps ? capabilities : undefined };
}

/** Strip invalid empty effort entries and drop unparseable inactive protocol drafts before saving. */
export function sanitizeModelSettings(
  settings: Partial<Record<Protocol, ProtocolConfig>>,
  activeProtocol: Protocol,
): Partial<Record<Protocol, ProtocolConfig>> {
  const out: Partial<Record<Protocol, ProtocolConfig>> = {};
  for (const [proto, cfg] of Object.entries(settings) as [Protocol, ProtocolConfig | undefined][]) {
    if (!cfg) continue;
    const cleanedMap = cleanEffortMap(cfg.capabilities?.effortMap);
    const caps = cfg.capabilities ? { ...cfg.capabilities, effortMap: cleanedMap } : undefined;
    const hasCaps = caps && Object.values(caps).some(v => v !== undefined);
    const normalized: ProtocolConfig = { ...cfg, capabilities: hasCaps ? caps : undefined };
    if (proto === activeProtocol || protocolConfigSchema.safeParse(normalized).success) {
      out[proto] = normalized;
    }
  }
  return out;
}

/** Keep custom wire mappings when revisiting an effort; remove contradictory switches. */
export function selectReasoningEffort(config: ProtocolConfig, effort?: typeof EFFORTS[number]): ProtocolConfig {
  const reasoning = { ...config.reasoning, effort, enabled: undefined, budgetTokens: undefined };
  const nextMap = { ...config.capabilities?.effortMap };
  const budget = config.capabilities?.thinkingDialect === 'budget';
  if (budget && config.reasoning?.effort && config.reasoning.budgetTokens !== undefined) {
    nextMap[config.reasoning.effort] = config.reasoning.budgetTokens;
  }
  if (!effort) {
    const effortMap = cleanEffortMap(nextMap);
    const capabilities = { ...config.capabilities, effortMap };
    const hasCaps = Object.values(capabilities).some(v => v !== undefined);
    return { ...config, reasoning: undefined, capabilities: hasCaps ? capabilities : undefined };
  }
  if (nextMap[effort] === undefined || (typeof nextMap[effort] === 'string' && nextMap[effort].trim() === '')) {
    nextMap[effort] = budget ? 1024 : effort;
  }
  const effortMap = cleanEffortMap(nextMap);
  // Empty reasoning must be absent: some adapters interpret its presence as enabled.
  const hasReasoning = Object.values(reasoning).some(v => v !== undefined);
  return { ...config, reasoning: hasReasoning ? reasoning : undefined,
    capabilities: { ...config.capabilities, effortMap } };
}

export function setThinkingEnabled(config: ProtocolConfig, enabled?: boolean): ProtocolConfig {
  // An explicit switch owns the on/off decision; an incompatible effort must not override it.
  const effort = config.reasoning?.effort;
  const clearEffort = enabled === false || (enabled === true && effort === 'off');
  const reasoning = { ...config.reasoning, enabled, ...(clearEffort ? { effort: undefined } : {}) };
  return { ...config, reasoning: Object.values(reasoning).some(v => v !== undefined) ? reasoning : undefined };
}
