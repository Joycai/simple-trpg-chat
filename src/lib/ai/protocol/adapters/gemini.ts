import type { Adapter, Wire, CompletionEvent } from '../types';
import { array, call, checkEnvelope, object, requiredString, stopStatus, string } from '../wire';
import { invalid } from '../errors';
import { mergeUsage, normalizeUsage } from '../usage';
export const gemini: Adapter = {
  build(r, source) {
    const contents: { role: string; parts: unknown[] }[] = [], names = new Map<string, { name: string; wireId?: string }>();
    for (const m of r.messages) {
      const originalCalls = array(m.continuation?.source === source ? m.continuation.payload : []).map(object).filter(p => p.functionCall).map(p => object(p.functionCall));
      for (const [i, c] of (m.tool_calls ?? []).entries()) names.set(c.id, { name: c.function.name, wireId: string(originalCalls[i]?.id) || undefined });
      if (m.role === 'system' || m.role === 'developer') continue;
      const role = m.role === 'assistant' ? 'model' : 'user';
      let parts: unknown[];
      if (m.continuation?.source === source) parts = array(m.continuation.payload);
      else if (m.role === 'tool') {
        const target = names.get(m.tool_call_id!); if (!target) invalid('Unknown Gemini function result');
        let response: unknown; try { response = JSON.parse(m.content ?? ''); } catch { response = { result: m.content ?? '' }; }
        if (!response || typeof response !== 'object' || Array.isArray(response)) response = { result: response };
        parts = [{ functionResponse: { name: target.name, ...(target.wireId ? { id: target.wireId } : {}), response } }];
      } else parts = [...(m.content ? [{ text: m.content }] : []), ...(m.tool_calls ?? []).map(c => ({ functionCall: { name: c.function.name, args: JSON.parse(c.function.arguments) } }))];
      const last = contents.at(-1); if (last?.role === role) last.parts.push(...parts); else contents.push({ role, parts: [...parts] });
    }
    const choice = r.toolChoice;
    return { systemInstruction: { parts: [{ text: r.messages.filter(m => m.role === 'system' || m.role === 'developer').map(m => m.content ?? '').join('\n') }] }, contents,
      ...(r.tools?.length ? { tools: [{ functionDeclarations: r.tools.map(t => ({ name: t.function.name, description: t.function.description, parametersJsonSchema: t.function.parameters })) }] } : {}),
      ...(choice ? { toolConfig: { functionCallingConfig: { mode: typeof choice === 'object' || choice === 'required' ? 'ANY' : choice === 'none' ? 'NONE' : 'AUTO', ...(typeof choice === 'object' ? { allowedFunctionNames: [choice.name] } : {}) } } } : {}),
      generationConfig: { ...(r.maxOutputTokens ? { maxOutputTokens: r.maxOutputTokens } : {}), ...(r.temperature !== undefined ? { temperature: r.temperature } : {}) } };
  },
  parse(value, source) {
    const data = object(value); checkEnvelope(data);
    const candidate = object(array(data.candidates)[0]), feedback = object(data.promptFeedback);
    const stopReason = string(feedback.blockReason) || requiredString(candidate.finishReason, 'Gemini finish reason');
    const parts = array(object(candidate.content).parts).map(object).filter(p => !(Object.keys(p).length === 1 && p.text === '')); // Gemini can emit a bare empty terminal text part; signed parts must survive.
    const calls = parts.filter(p => p.functionCall).map(p => { const f = object(p.functionCall); return call(string(f.id) || `gemini_${crypto.randomUUID()}`, f.name, f.args); });
    return { message: { role: 'assistant', content: parts.filter(p => !p.thought).map(p => string(p.text)).join(''), ...(calls.length ? { tool_calls: calls } : {}), continuation: { source, payload: parts } }, reasoning: parts.filter(p => p.thought).map(p => string(p.text)).join(''), status: feedback.blockReason ? 'blocked' : stopStatus(stopReason, calls.length > 0), stopReason, usage: normalizeUsage('gemini', object(data.usageMetadata)) };
  },
  accumulator() {
    let usage: Wire = {}, stop = '', feedback: unknown;
    const parts: unknown[] = [];
    return {
      push(d) {
        checkEnvelope(d); if (d.usageMetadata) usage = mergeUsage(usage, object(d.usageMetadata));
        if (d.promptFeedback) feedback = d.promptFeedback;
        const candidate = object(array(d.candidates)[0]); if (candidate.finishReason) stop = string(candidate.finishReason);
        const incoming = array(object(candidate.content).parts); parts.push(...incoming);
        return incoming.map(object).filter(p => typeof p.text === 'string').map(p => ({ type: p.thought ? 'reasoning' : 'text', delta: string(p.text) } as CompletionEvent));
      },
      finish() { if (!stop && !object(feedback).blockReason) invalid('Incomplete Gemini stream'); return { usageMetadata: usage, promptFeedback: feedback, candidates: [{ finishReason: stop, content: { role: 'model', parts } }] }; },
      usage: () => usage,
    };
  },
};
