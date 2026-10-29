import { AI_VENDORS, getVendor, vendorLabel, vendorOptions } from '../provider-presets';
import { describe, expect, it } from 'vitest';
import { selectReasoningEffort, setThinkingEnabled, modelConnection, modelSchema, presetRoutes, settingsForProtocol, validateVendorRoute, vendorSchema } from '../vendor-config';
import { buildModelsRequest } from '../model-fetch';
import { parseProtocolConfig, resolveConnection, reasoningBody } from '../protocol/config';
const model = { name: 'Display', model: 'm', protocol: 'chat' as const, settings: {}, isShared: false, tokenRateInput: 0, tokenRateCached: 0, tokenRateOutput: 0 };
describe('Vendor/model configuration', () => {
  it('rejects duplicate routes and invalid prices', () => {
    const route = presetRoutes('openai')[0];
    expect(vendorSchema.safeParse({ name: 'x', platform: 'custom', routes: [route, route] }).success).toBe(false);
    for (const value of [-1, NaN, Infinity]) expect(modelSchema.safeParse({ ...model, tokenRateInput: value }).success).toBe(false);
  });
  it.each(['chat', 'responses', 'messages', 'gemini'] as const)('resolves %s from the selected vendor route', protocol => {
    const result = modelConnection([{ protocol, endpoint: 'https://api.example/v1', endpointMode: 'base' }], { ...model, protocol });
    expect(resolveConnection(result.apiEndpoint, 'key', 'm', result.protocolConfig).protocol).toBe(protocol);
  });
  it('prevents unavailable route selection', () => {
    expect(() => modelConnection(presetRoutes('openai'), { ...model, protocol: 'messages' })).toThrow('routeInUse');
  });
  it('parks settings without leaking them into a new protocol', () => {
    const chat = parseProtocolConfig({ version: 1, protocol: 'chat', reasoning: { effort: 'high' }, capabilities: { effortMap: { high: 'high' } }, stream: true, contextWindow: 100000 });
    const parked = { chat };
    expect(settingsForProtocol(parked, 'responses')).toEqual({ version: 1, protocol: 'responses', endpointMode: 'base' });
    expect(settingsForProtocol(parked, 'chat')).toBe(chat);
  });
  it('rebinds model identity but takes endpoint/auth exclusively from vendor', () => {
    const chat = parseProtocolConfig({ version: 1, protocol: 'chat', model: 'old', auth: 'none', endpointMode: 'full', stream: true });
    const result = modelConnection(presetRoutes('openai'), { ...model, settings: { chat } });
    expect(result.protocolConfig).toMatchObject({ model: 'm', stream: true, endpointMode: 'base' });
    expect(resolveConnection(result.apiEndpoint, 'key', 'm', result.protocolConfig).headers.Authorization).toBe('Bearer key');
  });
  it('validates optional limits and preserves unset capability declarations', () => {
    const config = modelConnection(presetRoutes('openai'), model).protocolConfig;
    expect(config.contextWindow).toBeUndefined(); expect(config.multimodalInput).toBeUndefined();
    expect(() => modelConnection(presetRoutes('openai'), { ...model, settings: { chat: { ...config, contextWindow: 10, maxOutputTokens: 20 } } })).toThrow();
  });
  it('rejects undeclared efforts and impossible thinking budgets before save', () => {
    const cfg = parseProtocolConfig({ version: 1, protocol: 'chat', reasoning: { effort: 'high' } });
    expect(() => modelConnection(presetRoutes('openai'), { ...model, settings: { chat: cfg } })).toThrow();
    const messages = parseProtocolConfig({ version: 1, protocol: 'messages', maxOutputTokens: 1024, reasoning: { effort: 'high' }, capabilities: { thinkingDialect: 'budget', effortMap: { high: 1024 } } });
    expect(() => modelConnection(presetRoutes('anthropic'), { ...model, protocol: 'messages', settings: { messages } })).toThrow();
  });
  it('supports full Gemini routes and model listing without changing the bound model', () => {
    const route = { protocol: 'gemini' as const, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-example:generateContent', endpointMode: 'full' as const };
    const probe = validateVendorRoute(route);
    expect(probe.model).toBe('gemini-example');
    expect(buildModelsRequest('google', route.endpoint, 'key', { ...probe.config, model: probe.model }).url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(() => modelConnection([route], { ...model, model: 'gemini-example', protocol: 'gemini' })).not.toThrow();
    expect(() => modelConnection([route], { ...model, protocol: 'gemini' })).toThrow();
  });
  it('validates routes even when no models exist', () => {
    expect(() => validateVendorRoute({ protocol: 'responses', endpoint: 'https://api.example/v1/chat/completions', endpointMode: 'full' })).toThrow();
    expect(() => validateVendorRoute({ protocol: 'chat', endpoint: 'https://user:secret@api.example', endpointMode: 'base' })).toThrow();
    expect(() => validateVendorRoute(presetRoutes('openrouter')[0])).not.toThrow();
  });
});

describe('built-in vendor presets', () => {
  it('offers exactly the requested nine presets in order, preserving legacy configurations', () => {
    expect(AI_VENDORS.map(v => v.id)).toEqual(['openai', 'google', 'anthropic', 'qwen', 'qwen-token-plan', 'volcengine', 'volcengine-agent-plan', 'deepseek', 'openai-compatible']);
    expect(vendorOptions()).toHaveLength(9);
    expect(vendorOptions('openrouter').at(-1)?.id).toBe('openrouter');
    expect(getVendor('openrouter')?.name).toBe('OpenRouter');
    expect(vendorLabel(getVendor('qwen')!, 'en')).toBe('Alibaba Qwen');
    for (const v of AI_VENDORS.filter(v => v.id !== 'openai-compatible')) {
      for (const r of presetRoutes(v.id)) expect(() => validateVendorRoute(r)).not.toThrow();
    }
  });
  it('keeps ordinary and subscription endpoints separate', () => {
    expect(presetRoutes('qwen')[0].endpoint).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(presetRoutes('qwen-token-plan')[0].endpoint).toBe('https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
    expect(presetRoutes('volcengine')[0].endpoint).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(presetRoutes('volcengine-agent-plan')[0].endpoint).toBe('https://ark.cn-beijing.volces.com/api/plan/v3');
  });
  it.each([
    ['qwen', 'https://dashscope.aliyuncs.com/apps/anthropic/v1/messages'],
    ['qwen-token-plan', 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic/v1/messages'],
    ['volcengine', 'https://ark.cn-beijing.volces.com/api/compatible/v1/messages'],
    ['volcengine-agent-plan', 'https://ark.cn-beijing.volces.com/api/plan/v1/messages'],
  ])('%s Messages uses its native path and Bearer credentials', (platform, url) => {
    const route = presetRoutes(platform).find(r => r.protocol === 'messages')!;
    const connection = modelConnection([route], { ...model, protocol: 'messages' });
    const resolved = resolveConnection(connection.apiEndpoint, 'test-key', 'm', connection.protocolConfig);
    expect(resolved.url).toBe(url);
    expect(resolved.headers.Authorization).toBe('Bearer test-key');
    expect(resolved.headers['x-api-key']).toBeUndefined();
  });
});

describe('reasoning editor transitions', () => {
  it('restores custom effort mappings instead of replacing them with labels', () => {
    const config = parseProtocolConfig({ version: 1, protocol: 'responses', reasoning: { effort: 'high' }, capabilities: { effortMap: { high: 'max', low: 'minimal' } } });
    const low = selectReasoningEffort(config, 'low');
    const high = selectReasoningEffort(low, 'high');
    expect(high.capabilities?.effortMap?.high).toBe('max');
    expect(high.capabilities?.effortMap?.low).toBe('minimal');
    expect(reasoningBody(high, { model: 'm', messages: [] })).toEqual({ reasoning: { effort: 'max' } });
  });
  it('turns a legacy budget override into a visible effort mapping', () => {
    const config = parseProtocolConfig({ version: 1, protocol: 'messages', reasoning: { effort: 'high', budgetTokens: 4096 }, capabilities: { thinkingDialect: 'budget', effortMap: { high: 2048, low: 1024 } } });
    const low = selectReasoningEffort(config, 'low');
    expect(low.reasoning?.budgetTokens).toBeUndefined();
    expect(reasoningBody(low, { model: 'm', messages: [] })).toEqual({ thinking: { type: 'enabled', budget_tokens: 1024 } });
    expect(selectReasoningEffort(low, 'high').capabilities?.effortMap?.high).toBe(4096);
  });
  it('does not send an effort field when Messages thinking is disabled', () => {
    const config = parseProtocolConfig({ version: 1, protocol: 'messages', reasoning: { effort: 'off' }, capabilities: { thinkingDialect: 'adaptive', effortMap: { off: 'off' } } });
    expect(reasoningBody(config, { model: 'm', messages: [] })).toEqual({ thinking: { type: 'disabled' } });
  });
  it('removes contradictory effort and switch combinations', () => {
    const config = parseProtocolConfig({ version: 1, protocol: 'chat', reasoning: { effort: 'high' }, capabilities: { thinkingDialect: 'thinking', effortMap: { high: 'high' } } });
    const off = setThinkingEnabled(config, false);
    expect(reasoningBody(off, { model: 'm', messages: [] })).toEqual({ thinking: { type: 'disabled' } });
    const on = selectReasoningEffort(off, 'high');
    expect(reasoningBody(on, { model: 'm', messages: [] })).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 'high' });
  });
});
