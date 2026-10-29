import type { Adapter, Wire, CompletionEvent } from '../types';
import { array, call, checkEnvelope, object, requiredString, stopStatus, string, texts } from '../wire';
import { mergeUsage, normalizeUsage } from '../usage';
import { ThinkSplitter, splitThinking } from '../thinking';
import { invalid } from '../errors';
export const chat: Adapter = {
  build(r, source) {
    return {
      model: r.model,
      messages: r.messages.map(m => ({ role: m.role, content: m.content ?? null, ...(m.name ? { name: m.name } : {}), ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}), ...(m.continuation?.source === source ? object(m.continuation.payload) : {}) })),
      ...(r.tools?.length ? { tools: r.tools } : {}),
      ...(r.toolChoice ? { tool_choice: typeof r.toolChoice === 'string' ? r.toolChoice : { type: 'function', function: { name: r.toolChoice.name } } } : {}),
      ...(r.maxOutputTokens ? { max_tokens: r.maxOutputTokens } : {}),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
      ...(r.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };
  },
  parse(value, source) {
    const data = object(value); checkEnvelope(data);
    const choice = object(array(data.choices)[0]);
    if (!choice.message) invalid('Missing completion message');
    const m = object(choice.message), stopReason = requiredString(choice.finish_reason, 'finish reason');
    const calls = array(m.tool_calls).map(c => { const t = object(c), f = object(t.function); return call(t.id, f.name, f.arguments); });
    const payload: Wire = {};
    const inline = splitThinking(texts(m.content));
    for (const key of ['reasoning_content', 'reasoning', 'reasoning_details', 'encrypted_content']) if (m[key] !== undefined) payload[key] = m[key];
    return { message: { role: 'assistant', content: inline.text, ...(calls.length ? { tool_calls: calls } : {}), ...(Object.keys(payload).length ? { continuation: { source, payload } } : {}) }, reasoning: (string(m.reasoning_content) || string(m.reasoning)) + inline.reasoning, status: m.refusal ? 'blocked' : stopStatus(stopReason, calls.length > 0), stopReason, usage: normalizeUsage('chat', object(data.usage)) };
  },
  accumulator() {
    let content = '', stop = '', usage: Wire = {};
    const reasoning: Wire = {};
    const calls = new Map<number, Wire>();
    const splitter = new ThinkSplitter();
    let refusal = '';
    const details: Wire[] = [];
    return {
      push(d) {
        checkEnvelope(d); if (d.usage) usage = mergeUsage(usage, object(d.usage));
        const choice = object(array(d.choices)[0]), delta = object(choice.delta);
        if (choice.finish_reason) stop = string(choice.finish_reason);
        const text = texts(delta.content); content += text;
        refusal += string(delta.refusal);
        for (const entry of array(delta.reasoning_details)) {
          const part = object(entry);
          // Text/summary deltas share a block index; encrypted blobs are discrete
          // opaque values and must never be concatenated or rewritten.
          const previous = typeof part.index === 'number' && ['reasoning.text', 'reasoning.summary'].includes(string(part.type))
            ? details.find(p => p.index === part.index && p.type === part.type && (!p.id || !part.id || p.id === part.id)) : undefined;
          if (!previous) details.push({ ...part });
          else for (const [key, value] of Object.entries(part)) {
            if (['text', 'summary', 'signature'].includes(key) && typeof value === 'string') previous[key] = string(previous[key]) + value;
            else if (previous[key] == null) previous[key] = value;
          }
        }
        const split = splitter.push(text, !!choice.finish_reason);
        for (const key of ['reasoning_content', 'reasoning']) if (typeof delta[key] === 'string') reasoning[key] = string(reasoning[key]) + delta[key];
        if (delta.encrypted_content !== undefined) reasoning.encrypted_content = delta.encrypted_content;
        const thought = string(delta.reasoning_content) || string(delta.reasoning);
        for (const item of array(delta.tool_calls)) {
          const t = object(item), index = t.index;
          if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) invalid('Missing tool stream index');
          const old = calls.get(index) ?? { id: '', name: '', arguments: '' }, f = object(t.function);
          if (t.id) old.id = t.id;
          if (f.name) old.name = string(old.name) + string(f.name);
          old.arguments = string(old.arguments) + string(f.arguments); calls.set(index, old);
        }
        const events: CompletionEvent[] = [];
        if (split.text) events.push({ type: 'text', delta: split.text });
        if (split.reasoning) events.push({ type: 'reasoning', delta: split.reasoning });
        if (thought) events.push({ type: 'reasoning', delta: thought });
        return events;
      },
      finish() { if (!stop) invalid('Stream ended without a finish reason'); return { usage, choices: [{ finish_reason: stop, message: { role: 'assistant', content, ...(refusal ? { refusal } : {}), ...(details.length ? { reasoning_details: details } : {}), ...reasoning, tool_calls: [...calls.values()].map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } })) } }] }; },
      usage: () => usage,
    };
  },
};
