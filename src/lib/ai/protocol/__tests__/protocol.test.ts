import { describe, it, expect, vi, afterEach } from 'vitest';
import { complete, streamCompletion } from '../client';
import { resolveConnection, parseProtocolConfig } from '../config';
import type { CompletionRequest, Protocol, Wire } from '../types';
import { normalizeUsage } from '../usage';
vi.mock('@/lib/security/url-guard', () => ({ validateApiEndpoint: vi.fn(async () => ({ valid: true })) }));
import { validateApiEndpoint } from '@/lib/security/url-guard';
const fetchMock = vi.fn();
const endpoint = 'https://llm.example/v1';
const tool = { type: 'function' as const, function: { name: 'roll', description: 'Roll dice', parameters: { type: 'object', properties: {} } } };
const request: CompletionRequest = { model: 'model', messages: [{ role: 'user', content: 'roll' }], tools: [tool] };
function connection(protocol: Protocol, stream = false) { return resolveConnection(endpoint, 'test-key', 'model', { version: 1, protocol }, 1, stream); }
function response(protocol: Protocol, tools = false): Wire {
  if (protocol === 'chat') return { choices: [{ finish_reason: tools ? 'tool_calls' : 'stop', message: { content: tools ? null : 'hello', reasoning_content: 'private thought', ...(tools ? { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'roll', arguments: '{}' } }] } : {}) } }], usage: { prompt_tokens: 20, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } } };
  if (protocol === 'messages') return { stop_reason: tools ? 'tool_use' : 'end_turn', content: [{ type: 'thinking', thinking: 'private thought', signature: 'opaque-signature' }, ...(tools ? [{ type: 'tool_use', id: 'c1', name: 'roll', input: {} }] : [{ type: 'text', text: 'hello' }])], usage: { input_tokens: 12, cache_read_input_tokens: 4, cache_creation_input_tokens: 4, output_tokens: 5 } };
  if (protocol === 'responses') return { status: 'completed', output: [{ type: 'reasoning', id: 'r1', encrypted_content: 'opaque-encrypted', summary: [{ type: 'summary_text', text: 'private thought' }] }, ...(tools ? [{ type: 'function_call', id: 'fc1', call_id: 'c1', name: 'roll', arguments: '{}' }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] }])], usage: { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 4 } } };
  return { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'private thought', thought: true, thoughtSignature: 'opaque-signature' }, ...(tools ? [{ functionCall: { name: 'roll', args: {} }, thoughtSignature: 'tool-signature' }] : [{ text: 'hello' }])] } }], usageMetadata: { promptTokenCount: 20, cachedContentTokenCount: 4, candidatesTokenCount: 3, thoughtsTokenCount: 2 } };
}
function queue(...bodies: Wire[]) { vi.stubGlobal('fetch', fetchMock); for (const b of bodies) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(b))); }
function body(index = 0) { return JSON.parse(fetchMock.mock.calls[index][1].body); }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); fetchMock.mockReset(); vi.useRealTimers(); });
describe.each<Protocol>(['chat', 'messages', 'responses', 'gemini'])('%s adapter', protocol => {
  it('normalizes text, reasoning and usage without mutating input', async () => {
    const before = structuredClone(request); queue(response(protocol));
    const result = await complete(connection(protocol), request);
    expect(result.status).toBe('completed'); expect(result.message.content).toBe('hello'); expect(result.reasoning).toBe('private thought');
    expect(result.usage).toMatchObject({ inputTotal: 20, cacheRead: 4, outputTotal: 5, status: 'reported' });
    expect(request).toEqual(before);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });
  it('round-trips opaque continuation and pairs tool results', async () => {
    queue(response(protocol, true), response(protocol));
    const first = await complete(connection(protocol), request);
    expect(first.status).toBe('tool_calls');
    const second = await complete(connection(protocol), { ...request, messages: [...request.messages, first.message, { role: 'tool', tool_call_id: first.message.tool_calls![0].id, content: '{"result":4}' }], toolChoice: 'none' });
    expect(second.message.content).toBe('hello');
    const wire = JSON.stringify(body(1));
    expect(wire).not.toContain('continuation'); expect(wire).not.toContain('source');
    expect(wire).toContain(protocol === 'responses' ? 'opaque-encrypted' : protocol === 'chat' ? 'private thought' : 'opaque-signature');
    if (protocol === 'gemini') expect(wire).toContain('"functionResponse":{"name":"roll"');
    if (protocol === 'responses') { expect(body(1).store).toBe(false); expect(body(1).tools[0].strict).toBe(false); expect(wire).toContain('"call_id":"c1"'); }
    if (protocol === 'messages') expect(fetchMock.mock.calls[0][1].headers['anthropic-version']).toBe('2023-06-01');
  });
  it('rejects cross-route continuation before fetching', async () => {
    queue(response(protocol, true)); const first = await complete(connection(protocol), request);
    const different = resolveConnection(endpoint, 'key', 'model', { version: 1, protocol }, 2);
    await expect(complete(different, { ...request, messages: [...request.messages, first.message, { role: 'tool', tool_call_id: first.message.tool_calls![0].id, content: '{}' }] })).rejects.toThrow('another route');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('recognizes HTTP-200 error envelopes', async () => {
    queue({ error: { message: 'not a success' } });
    await expect(complete(connection(protocol), request)).rejects.toThrow('error envelope');
  });
});

describe('usage', () => {
  it('distinguishes missing from reported zero', () => {
    expect(normalizeUsage('chat').status).toBe('missing'); expect(normalizeUsage('chat').inputTotal).toBeNull();
    expect(normalizeUsage('chat', { prompt_tokens: 0, completion_tokens: 0 })).toMatchObject({ status: 'reported', inputTotal: 0, outputTotal: 0 });
  });
  it('does not double-count cache aliases or reasoning', () => {
    expect(normalizeUsage('chat', { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 30, prompt_tokens_details: { cached_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 40 } })).toMatchObject({ inputTotal: 100, cacheRead: 30, inputUncached: 70, outputTotal: 50, reasoningOutput: 40 });
  });
  it('adds non-overlapping Anthropic buckets and Gemini thoughts/tool input', () => {
    expect(normalizeUsage('messages', { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 4 })).toMatchObject({ inputTotal: 60, inputUncached: 10, cacheRead: 20, cacheWrite: 30 });
    expect(normalizeUsage('gemini', { promptTokenCount: 10, toolUsePromptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 5 })).toMatchObject({ inputTotal: 13, outputTotal: 9 });
  });
  it('does not accept negative or nonfinite usage', () => { expect(normalizeUsage('chat', { prompt_tokens: -1, completion_tokens: Infinity })).toMatchObject({ inputTotal: null, outputTotal: null, status: 'partial' }); });
});

describe('validation and configuration', () => {
  it('preserves legacy Chat and rejects unknown protocols', () => { expect(parseProtocolConfig(null).protocol).toBe('chat'); expect(() => parseProtocolConfig({ version: 1, protocol: 'unknown' })).toThrow(); });
  it('handles full endpoints without duplicating paths', () => { expect(resolveConnection(endpoint + '/responses/', 'key', 'm', { version: 1, protocol: 'responses', endpointMode: 'full' }).url).toBe(endpoint + '/responses'); });
  it('rejects URL credentials/query, protocol mismatch and model mismatch', () => {
    for (const url of ['https://user:key@llm.example', endpoint + '?key=x']) expect(() => resolveConnection(url, 'key', 'm')).toThrow();
    expect(() => resolveConnection(endpoint + '/messages', 'key', 'm', { version: 1, protocol: 'chat', endpointMode: 'full' })).toThrow();
    expect(() => resolveConnection(endpoint, 'key', 'other', { version: 1, protocol: 'messages', model: 'm' })).toThrow();
  });
  it.each(['chat','responses','messages','gemini'] as Protocol[])('rejects malformed tool history for %s', async p => {
    await expect(complete(connection(p), { ...request, messages: [{ role: 'tool', tool_call_id: 'missing', content: '{}' }] })).rejects.toThrow('Unmatched');
  });
  it('maps explicit efforts and never injects an undeclared one', async () => {
    queue(response('responses'));
    const c = resolveConnection(endpoint, 'key', 'model', { version: 1, protocol: 'responses', reasoning: { effort: 'high' }, capabilities: { effortMap: { high: 'high' } } });
    await complete(c, request); expect(body().reasoning).toEqual({ effort: 'high' });
    await expect(complete(connection('chat'), { ...request, reasoning: { effort: 'high' } })).rejects.toThrow('undeclared');
  });
  it('keeps off distinct from low and supports Gemini budgets', async () => {
    queue(response('gemini'));
    await complete(resolveConnection(endpoint, 'key', 'model', { version: 1, protocol: 'gemini', reasoning: { enabled: false }, capabilities: { thinkingDialect: 'budget' } }), request);
    expect(body().generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
  it('requires paired tools and declared forced choices', async () => {
    await expect(complete(resolveConnection(endpoint, 'key', 'model', { version: 1, protocol: 'chat', capabilities: { toolChoices: ['auto'] } }), { ...request, toolChoice: 'none' })).rejects.toThrow('Unsupported');
  });
  it('records usage before rejecting malformed output', async () => {
    queue({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 1 } }); const observe = vi.fn();
    await expect(complete(connection('chat'), request, observe)).rejects.toThrow();
    expect(observe.mock.calls[0][0].usage).toMatchObject({ inputTotal: 9, outputTotal: 1 });
  });
  it('marks empty successful turns incomplete and still records usage', async () => {
    queue({ choices: [{ finish_reason: 'stop', message: { content: null } }], usage: { prompt_tokens: 3, completion_tokens: 8 } }); const observe = vi.fn();
    expect((await complete(connection('chat'), request, observe)).status).toBe('incomplete'); expect(observe).toHaveBeenCalledOnce();
  });
});

function sse(events: unknown[]): Response { return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } }); }
describe('streaming', () => {
  it('assembles Chat tools by index and reads usage-only chunks', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(sse([
      { choices: [{ delta: { reasoning_content: 'think', tool_calls: [{ index: 0, id: 'c1', function: { name: 'roll', arguments: '{' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } },
    ]));
    const result = await complete(connection('chat', true), { ...request, stream: true });
    expect(result.message.tool_calls![0].function.arguments).toBe('{}'); expect(result.usage.inputTotal).toBe(10); expect(result.reasoning).toBe('think');
  });
  it('assembles Messages signatures and snapshot usage without resetting input', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'thought' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'signature' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hello' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } }, { type: 'message_stop' },
    ]));
    const result = await complete(connection('messages', true), { ...request, stream: true });
    expect(result.usage).toMatchObject({ inputTotal: 10, outputTotal: 3 }); expect(JSON.stringify(result.message.continuation)).toContain('signature');
  });
  it('uses Responses terminal output once, preserving encrypted items', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([
      { type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed', response: response('responses') },
    ]));
    const events = []; for await (const e of streamCompletion(connection('responses', true), { ...request, stream: true })) events.push(e);
    expect(events[0]).toEqual({ type: 'text', delta: 'hello' }); expect(events.at(-1)).toMatchObject({ type: 'done', result: { message: { content: 'hello' } } });
  });
  it('keeps Gemini parts and thought signatures', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([response('gemini', true)]));
    const result = await complete(connection('gemini', true), { ...request, stream: true });
    expect(result.status).toBe('tool_calls'); expect(JSON.stringify(result.message.continuation)).toContain('tool-signature');
  });
  it.each(['chat','messages','responses','gemini'] as Protocol[])('rejects missing terminal events for %s', async p => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([{}]));
    await expect(complete(connection(p, true), { ...request, stream: true })).rejects.toThrow();
  });
  it('retains partial usage on a stream error and never retries it', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([{ type: 'message_start', message: { usage: { input_tokens: 7 } } }, { type: 'error', error: { message: 'overloaded' } }]));
    const observe = vi.fn(); await expect(complete(connection('messages', true), { ...request, stream: true }, observe)).rejects.toThrow();
    expect(observe.mock.calls[0][0].usage.inputTotal).toBe(7); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('rejects a half SSE frame', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(new Response('data: {"choices":'));
    await expect(complete(connection('chat', true), { ...request, stream: true })).rejects.toThrow('Truncated');
  });
});

describe('transport', () => {
  it('rejects blocked endpoints before any fetch', async () => {
    vi.mocked(validateApiEndpoint).mockResolvedValueOnce({ valid: false, error: 'private' });
    await expect(complete(connection('chat'), request)).rejects.toThrow('Blocked'); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cancels while reading a hung response body', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start() {} })));
    const controller = new AbortController(), pending = complete(connection('chat'), { ...request, signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' }); controller.abort(); await assertion;
  });
  it('times out a transport that never returns', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = complete(connection('chat'), { ...request, timeoutMs: 20 }); const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(21); await assertion; expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('retries only explicit transient status codes and revalidates targets', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } })).mockResolvedValueOnce(new Response(JSON.stringify(response('chat'))));
    const pending = complete(connection('chat'), request); await vi.advanceTimersByTimeAsync(1001); expect((await pending).status).toBe('completed'); expect(validateApiEndpoint).toHaveBeenCalledTimes(2);
  });
  it('does not retry uncertain network failures or bad requests', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockRejectedValueOnce(new Error('network')); await expect(complete(connection('chat'), request)).rejects.toMatchObject({ code: 'network' }); expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('protocol edge cases', () => {
  it('keeps inline thinking out of final and streamed text across tag boundaries', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(sse([
      { choices: [{ delta: { content: '<thi' } }] },
      { choices: [{ delta: { content: 'nk>secret</th' } }] },
      { choices: [{ delta: { content: 'ink>hello' }, finish_reason: 'stop' }] },
    ]));
    const events = []; for await (const e of streamCompletion(connection('chat', true), { ...request, stream: true })) events.push(e);
    expect(events.filter(e => e.type === 'text')).toEqual([{ type: 'text', delta: 'hello' }]);
    expect(events.at(-1)).toMatchObject({ type: 'done', result: { message: { content: 'hello' }, reasoning: 'secret' } });
  });
  it('recognizes Chat refusals that arrive in stream deltas', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(sse([{ choices: [{ delta: { refusal: 'blocked' }, finish_reason: 'stop' }] }]));
    expect((await complete(connection('chat', true), { ...request, stream: true })).status).toBe('blocked');
  });
  it.each<Protocol>(['chat', 'messages', 'responses', 'gemini'])('does not execute tool-shaped incomplete output from %s', async p => {
    const data = response(p, true);
    if (p === 'chat') (data.choices as Wire[])[0].finish_reason = 'length';
    if (p === 'messages') data.stop_reason = 'max_tokens';
    if (p === 'responses') { data.status = 'incomplete'; data.incomplete_details = { reason: 'max_output_tokens' }; }
    if (p === 'gemini') (data.candidates as Wire[])[0].finishReason = 'MAX_TOKENS';
    queue(data); expect((await complete(connection(p), request)).status).toBe('truncated');
  });
  it('normalizes Gemini prompt blocking without candidates', async () => {
    queue({ promptFeedback: { blockReason: 'SAFETY' } }); expect((await complete(connection('gemini'), request)).status).toBe('blocked');
  });
  it('retains all Messages redacted reasoning blocks', async () => {
    const data = response('messages'); (data.content as unknown[]).unshift({ type: 'redacted_thinking', data: 'opaque' }); queue(data);
    const r = await complete(connection('messages'), request); expect(JSON.stringify(r.message.continuation)).toContain('opaque'); expect(r.message.content).toBe('hello');
  });
  it('rejects duplicate tool ids and broken argument JSON', async () => {
    const data = response('chat', true), msg = (data.choices as Wire[])[0].message as Wire;
    (msg.tool_calls as unknown[]).push((msg.tool_calls as unknown[])[0]); queue(data);
    await expect(complete(connection('chat'), request)).rejects.toThrow('duplicate');
    const broken = response('chat', true); (((broken.choices as Wire[])[0].message as Wire).tool_calls as { function: { arguments: string } }[])[0].function.arguments = '{'; queue(broken);
    await expect(complete(connection('chat'), request)).rejects.toThrow('arguments JSON');
  });
  it('retains tool definitions when forcing the last round to text', async () => {
    queue(response('messages')); await complete(connection('messages'), { ...request, toolChoice: 'none' });
    expect(body().tools).toHaveLength(1); expect(body().tool_choice).toEqual({ type: 'none' });
  });
  it('enforces total deadline while waiting to retry', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '10' } }));
    const pending = complete(connection('chat'), { ...request, deadlineMs: Date.now() + 30 });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' }); await vi.advanceTimersByTimeAsync(31); await assertion; expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('bounds response body size', async () => {
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockResolvedValueOnce(new Response('x'.repeat(8 * 1024 * 1024 + 1)));
    await expect(complete(connection('chat'), request)).rejects.toThrow('size limit');
  });
  it('decodes UTF-8 and CRLF split at arbitrary bytes', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '你好' }, finish_reason: 'stop' }] })}\r\n\r\n`);
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } })));
    expect((await complete(connection('chat', true), { ...request, stream: true })).message.content).toBe('你好');
  });
  it('rejects model-incompatible thinking dialects and budgets', async () => {
    const bad = resolveConnection(endpoint, 'k', 'model', { version: 1, protocol: 'chat', reasoning: { enabled: true }, capabilities: { thinkingDialect: 'adaptive' } });
    await expect(complete(bad, request)).rejects.toThrow('dialect');
    const budget = resolveConnection(endpoint, 'k', 'model', { version: 1, protocol: 'messages', reasoning: { enabled: true, budgetTokens: 4096 }, capabilities: { thinkingDialect: 'budget' } });
    await expect(complete(budget, request)).rejects.toThrow('smaller');
  });
});

it('retains usage on non-2xx errors and does not retry a billable failure', async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'failure' }, usage: { prompt_tokens: 3, completion_tokens: 5 } }), { status: 503 }));
  const observe = vi.fn();
  await expect(complete(connection('chat'), request, observe)).rejects.toMatchObject({ httpStatus: 503, usage: { inputTotal: 3, outputTotal: 5 } });
  expect(observe.mock.calls[0][0].usage.outputTotal).toBe(5); expect(fetchMock).toHaveBeenCalledOnce();
});

it('does not hide a valid completion when usage persistence fails', async () => {
  queue(response('chat'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await complete(connection('chat'), request, async () => { throw new Error('db unavailable'); })).message.content).toBe('hello'); }
  finally { log.mockRestore(); }
});

it('omits business temperature defaults when Messages thinking is enabled', async () => {
  queue(response('messages'));
  const c = resolveConnection(endpoint, 'key', 'model', { version: 1, protocol: 'messages', reasoning: { enabled: true, budgetTokens: 1024 }, capabilities: { thinkingDialect: 'budget' } });
  await complete(c, { ...request, defaultTemperature: 0.3 }); expect(body()).not.toHaveProperty('temperature');
  await expect(complete(c, { ...request, temperature: 0.3 })).rejects.toThrow('conflicts');
});

it('supports protocol-specific reasoning output controls without guessing model effort', async () => {
  queue(response('responses'), response('gemini'));
  await complete(connection('responses'), { ...request, reasoning: { summary: 'auto' } });
  expect(body().reasoning).toEqual({ summary: 'auto' });
  await complete(connection('gemini'), { ...request, reasoning: { includeThoughts: true } });
  expect(body(1).generationConfig.thinkingConfig).toEqual({ includeThoughts: true });
  await expect(complete(connection('chat'), { ...request, reasoning: { summary: 'auto' } })).rejects.toThrow('does not match');
});

it('discards bare empty Gemini terminal text but preserves signed empty parts', async () => {
  queue({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hello' }, { text: '' }, { text: '', thoughtSignature: 'opaque' }] } }] });
  const result = await complete(connection('gemini'), request);
  expect(result.message.continuation?.payload).toEqual([{ text: 'hello' }, { text: '', thoughtSignature: 'opaque' }]);
});

it('finishes on DONE and cancels an otherwise open HTTP body', async () => {
  vi.stubGlobal('fetch', fetchMock);
  const cancel = vi.fn();
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1 } }) + '\n\ndata: [DONE]\n\n'));
    }, cancel,
  })));
  const result = await complete(connection('chat', true), { ...request, stream: true, timeoutMs: 100 });
  expect(result.message.content).toBe('hello'); expect(cancel).toHaveBeenCalledOnce();
});

it('flushes a trailing partial think tag into streamed text', async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'hello <thi' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]));
  const events = [];
  for await (const event of streamCompletion(connection('chat', true), { ...request, stream: true })) events.push(event);
  expect(events.flatMap(e => e.type === 'text' ? [e.delta] : []).join('')).toBe('hello <thi');
});

it('reassembles indexed reasoning blocks and retains separate opaque blobs across tool rounds', async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(sse([
    { choices: [{ delta: { reasoning: 'a', reasoning_content: '', reasoning_details: [{ type: 'reasoning.text', index: 0, text: 'first', signature: null }, { type: 'reasoning.summary', index: 1, summary: 'sum' }] } }] },
    { choices: [{ delta: { reasoning_content: 'b', reasoning_details: [{ type: 'reasoning.text', index: 0, text: ' second', signature: 'signature' }, { type: 'reasoning.summary', index: 1, summary: 'mary' }, { type: 'reasoning.encrypted', index: 2, data: 'opaque1' }, { type: 'reasoning.encrypted', index: 2, data: 'opaque2' }], tool_calls: [{ index: 0, id: 'c1', function: { name: 'roll', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] },
  ]));
  const result = await complete(connection('chat', true), { ...request, stream: true });
  queue(response('chat'));
  await complete(connection('chat'), { ...request, messages: [...request.messages, result.message, { role: 'tool', tool_call_id: 'c1', content: '{}' }] });
  expect(body(1).messages[1]).toMatchObject({ reasoning: 'a', reasoning_content: 'b', reasoning_details: [
    { type: 'reasoning.text', index: 0, text: 'first second', signature: 'signature' },
    { type: 'reasoning.summary', index: 1, summary: 'summary' },
    { type: 'reasoning.encrypted', index: 2, data: 'opaque1' },
    { type: 'reasoning.encrypted', index: 2, data: 'opaque2' },
  ] });
});

it('retains nested usage counters across cumulative streaming snapshots', async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(sse([
    { choices: [{ delta: { content: 'hello' } }], usage: { prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 5 }, completion_tokens: 1 } },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens_details: { audio_tokens: 0 }, completion_tokens: 3 } },
  ]));
  const result = await complete(connection('chat', true), { ...request, stream: true });
  expect(result.usage).toMatchObject({ inputTotal: 20, cacheRead: 5, outputTotal: 3 });
});

it.each<Protocol>(['chat', 'messages', 'responses', 'gemini'])('rejects model and role mismatches for %s before network access', async protocol => {
  await expect(complete(connection(protocol), { ...request, model: 'another' })).rejects.toThrow('model does not match');
  await expect(complete(connection(protocol), { ...request, messages: [{ role: 'user', content: 'hello', tool_calls: [] }] })).rejects.toThrow('fields do not match');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects invalid runtime reasoning and timers before network access', async () => {
  await expect(complete(connection('gemini'), { ...request, reasoning: { budgetTokens: -1 } })).rejects.toThrow('Invalid reasoning');
  await expect(complete(connection('chat'), { ...request, timeoutMs: Infinity })).rejects.toThrow('Invalid request deadline');
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['chat', 'messages'] as const)('does not report a missing tool payload as completed for %s', async protocol => {
  const data = response(protocol);
  if (protocol === 'chat') (data.choices as Wire[])[0].finish_reason = 'tool_calls';
  else data.stop_reason = 'tool_use';
  queue(data);
  expect((await complete(connection(protocol), request)).status).toBe('incomplete');
});

it.each<Protocol>(['chat', 'messages', 'responses', 'gemini'])('round-trips a streamed tool turn and its reasoning through %s', async protocol => {
  vi.stubGlobal('fetch', fetchMock);
  const data = response(protocol, true);
  const events: Wire[] = protocol === 'chat'
    ? [{ choices: [{ delta: { ...((data.choices as Wire[])[0].message as Wire), tool_calls: [{ index: 0, id: 'c1', function: { name: 'roll', arguments: '{}' } }] }, finish_reason: 'tool_calls' }], usage: data.usage }]
    : protocol === 'responses' ? [{ type: 'response.completed', response: data }]
    : protocol === 'gemini' ? [data]
    : [
      { type: 'message_start', message: { usage: data.usage } },
      ...(data.content as Wire[]).flatMap((block, index) => [
        { type: 'content_block_start', index, content_block: block }, { type: 'content_block_stop', index },
      ]),
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }, { type: 'message_stop' },
    ];
  fetchMock.mockResolvedValueOnce(sse(events));
  const first = await complete(connection(protocol, true), { ...request, stream: true });
  queue(response(protocol));
  await complete(connection(protocol), { ...request, messages: [...request.messages, first.message, { role: 'tool', tool_call_id: first.message.tool_calls![0].id, content: '{"result":4}' }] });
  const wire = JSON.stringify(body(1));
  expect(wire).toContain(protocol === 'chat' ? 'private thought' : protocol === 'responses' ? 'opaque-encrypted' : 'opaque-signature');
  expect(wire).toContain(protocol === 'responses' ? 'function_call_output' : protocol === 'gemini' ? 'functionResponse' : protocol === 'messages' ? 'tool_result' : 'tool_call_id');
});

it.each<Protocol>(['chat', 'messages', 'responses', 'gemini'])('retains usage when an error arrives in the same %s SSE event', async protocol => {
  vi.stubGlobal('fetch', fetchMock);
  const data = response(protocol);
  const event = { type: 'error', error: { message: 'upstream failure' }, ...(protocol === 'gemini' ? { usageMetadata: data.usageMetadata } : protocol === 'responses' ? { response: { usage: data.usage } } : { usage: data.usage }) };
  fetchMock.mockResolvedValueOnce(sse([event]));
  const observe = vi.fn();
  await expect(complete(connection(protocol, true), { ...request, stream: true }, observe)).rejects.toThrow();
  expect(observe.mock.calls[0][0].usage).toMatchObject({ inputTotal: 20, outputTotal: 5 });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('does not turn upstream object keys into inherited billing counters', async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(sse([{ choices: [{ delta: { content: 'hello' }, finish_reason: 'stop' }], usage: JSON.parse('{"__proto__":{"prompt_tokens":1000000,"completion_tokens":1000000}}') }]));
  const result = await complete(connection('chat', true), { ...request, stream: true });
  expect(result.usage).toMatchObject({ inputTotal: null, outputTotal: null });
});
