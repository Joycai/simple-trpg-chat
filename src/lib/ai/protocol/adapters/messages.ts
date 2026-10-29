import type { Adapter, Wire, CompletionEvent } from '../types';
import { array, call, checkEnvelope, object, requiredString, stopStatus, string } from '../wire';
import { invalid } from '../errors';
import { mergeUsage, normalizeUsage } from '../usage';
export const messages: Adapter = {
  build(r, source) {
    const system = r.messages.filter(m => m.role === 'system' || m.role === 'developer').map(m => m.content ?? '').join('\n');
    const converted: { role: string; content: unknown[] }[] = [];
    for (const m of r.messages) {
      if (m.role === 'system' || m.role === 'developer') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      let content: unknown[];
      if (m.continuation?.source === source) content = array(m.continuation.payload);
      else if (m.role === 'tool') content = [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content ?? '' }];
      else content = [...(m.content ? [{ type: 'text', text: m.content }] : []), ...(m.tool_calls ?? []).map(c => ({ type: 'tool_use', id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments) }))];
      const last = converted.at(-1);
      if (last?.role === role) last.content.push(...content); else converted.push({ role, content: [...content] });
    }
    const choice = r.toolChoice;
    return { model: r.model, system, messages: converted, max_tokens: r.maxOutputTokens ?? 4096,
      ...(r.tools?.length ? { tools: r.tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) } : {}),
      ...(choice ? { tool_choice: typeof choice === 'object' ? { type: 'tool', name: choice.name } : { type: choice === 'required' ? 'any' : choice } } : {}),
      ...(r.temperature !== undefined ? { temperature: r.temperature } : {}), ...(r.stream ? { stream: true } : {}) };
  },
  parse(value, source) {
    const data = object(value); checkEnvelope(data);
    if (!Array.isArray(data.content)) invalid('Missing message content blocks');
    const blocks = array(data.content).map(object), stopReason = requiredString(data.stop_reason, 'stop reason');
    const calls = blocks.filter(p => p.type === 'tool_use').map(p => call(p.id, p.name, p.input));
    return { message: { role: 'assistant', content: blocks.filter(p => p.type === 'text').map(p => string(p.text)).join(''), ...(calls.length ? { tool_calls: calls } : {}), continuation: { source, payload: data.content } }, reasoning: blocks.filter(p => p.type === 'thinking').map(p => string(p.thinking)).join(''), status: stopStatus(stopReason, calls.length > 0), stopReason, usage: normalizeUsage('messages', object(data.usage)) };
  },
  accumulator() {
    let data: Wire = {}, usage: Wire = {}, done = false;
    const blocks = new Map<number, Wire>(), args = new Map<number, string>(), open = new Set<number>();
    let started = false;
    return {
      push(d) {
        checkEnvelope(d); const type = d.type, index = d.index as number;
        if (done && type !== 'ping') invalid('Event after Messages terminal');
        if (type === 'message_start') { if (started) invalid('Duplicate message start'); started = true; data = object(d.message); usage = object(data.usage); }
        if (type !== 'ping' && !started) invalid('Messages event before message start');
        if (['content_block_start', 'content_block_delta', 'content_block_stop'].includes(string(type)) && (!Number.isInteger(index) || index < 0)) invalid('Invalid content block index');
        if (type === 'content_block_start') { if (blocks.has(index)) invalid('Duplicate content block'); blocks.set(index, { ...object(d.content_block) }); open.add(index); }
        const events: CompletionEvent[] = [];
        if (type === 'content_block_delta') {
          const block = blocks.get(index); if (!block || !open.has(index)) invalid('Delta without open content block');
          const delta = object(d.delta);
          if (delta.type === 'text_delta') { block.text = string(block.text) + string(delta.text); events.push({ type: 'text', delta: string(delta.text) }); }
          if (delta.type === 'thinking_delta') { block.thinking = string(block.thinking) + string(delta.thinking); events.push({ type: 'reasoning', delta: string(delta.thinking) }); }
          if (delta.type === 'signature_delta') block.signature = string(block.signature) + string(delta.signature);
          if (delta.type === 'input_json_delta') args.set(index, (args.get(index) ?? '') + string(delta.partial_json));
        }
        if (type === 'content_block_stop' && args.has(index)) {
          try { blocks.get(index)!.input = JSON.parse(args.get(index)!); } catch { invalid('Incomplete streamed tool JSON'); }
          args.delete(index);
        }
        if (type === 'content_block_stop' && !open.delete(index)) invalid('Stop without open content block');
        if (type === 'message_delta') { data = { ...data, ...object(d.delta) }; usage = mergeUsage(usage, object(d.usage)); }
        if (type === 'message_stop') done = true;
        return events;
      },
      finish() { if (!done || args.size || open.size) invalid('Incomplete Messages stream'); return { ...data, content: [...blocks.entries()].sort(([a], [b]) => a - b).map(([, b]) => b), usage }; },
      usage: () => usage,
    };
  },
};
