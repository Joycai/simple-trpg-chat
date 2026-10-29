import type { Adapter, Wire, CompletionEvent } from '../types';
import { array, call, checkEnvelope, object, requiredString, string } from '../wire';
import { invalid } from '../errors';
import { mergeUsage, normalizeUsage } from '../usage';
export const responses: Adapter = {
  build(r, source) {
    const input: unknown[] = [];
    for (const m of r.messages) {
      if (m.role === 'system' || m.role === 'developer') continue;
      if (m.continuation?.source === source) { input.push(...array(m.continuation.payload)); continue; }
      if (m.role === 'tool') { input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content ?? '' }); continue; }
      if (m.content) input.push({ role: m.role, content: m.content });
      input.push(...(m.tool_calls ?? []).map(c => ({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments })));
    }
    return { model: r.model, instructions: r.messages.filter(m => m.role === 'system' || m.role === 'developer').map(m => m.content ?? '').join('\n'), input, store: false, include: ['reasoning.encrypted_content'],
      ...(r.tools?.length ? { tools: r.tools.map(t => ({ type: 'function', ...t.function, strict: false })) } : {}),
      ...(r.toolChoice ? { tool_choice: typeof r.toolChoice === 'object' ? { type: 'function', name: r.toolChoice.name } : r.toolChoice } : {}),
      ...(r.maxOutputTokens ? { max_output_tokens: r.maxOutputTokens } : {}), ...(r.temperature !== undefined ? { temperature: r.temperature } : {}), ...(r.stream ? { stream: true } : {}) };
  },
  parse(value, source) {
    const data = object(value); checkEnvelope(data);
    const state = requiredString(data.status, 'response status');
    if (!Array.isArray(data.output)) invalid('Missing response output');
    const items = array(data.output).map(object), calls = items.filter(p => p.type === 'function_call').map(p => call(p.call_id, p.name, p.arguments));
    const content = items.flatMap(p => array(p.content).map(object));
    const stopReason = state === 'incomplete' ? string(object(data.incomplete_details).reason) || state : state;
    const status = content.some(p => p.type === 'refusal') ? 'blocked' : state === 'completed' ? (calls.length ? 'tool_calls' : 'completed') : stopReason === 'max_output_tokens' ? 'truncated' : stopReason === 'content_filter' ? 'blocked' : 'incomplete';
    return { message: { role: 'assistant', content: content.filter(p => p.type === 'output_text').map(p => string(p.text)).join(''), ...(calls.length ? { tool_calls: calls } : {}), continuation: { source, payload: data.output } }, reasoning: items.filter(p => p.type === 'reasoning').flatMap(p => array(p.summary).map(s => string(object(s).text))).join(''), status, stopReason, usage: normalizeUsage('responses', object(data.usage)) };
  },
  accumulator() {
    let final: Wire | undefined, usage: Wire = {};
    const items = new Map<number, unknown>();
    return {
      push(d) {
        checkEnvelope(d);
        if (final) invalid('Event after Responses terminal');
        const response = object(d.response);
        if (response.usage) usage = mergeUsage(usage, object(response.usage));
        if (d.type === 'response.output_item.done') items.set(Number(d.output_index), d.item);
        if (['response.completed', 'response.failed', 'response.incomplete'].includes(string(d.type))) final = response;
        const events: CompletionEvent[] = [];
        if (d.type === 'response.output_text.delta') events.push({ type: 'text', delta: string(d.delta) });
        if (d.type === 'response.reasoning_summary_text.delta') events.push({ type: 'reasoning', delta: string(d.delta) });
        return events;
      },
      finish() { if (!final) invalid('Responses stream has no terminal event'); return { ...final, output: final.output ?? [...items.entries()].sort(([a], [b]) => a - b).map(([, p]) => p), usage }; },
      usage: () => usage,
    };
  },
};
