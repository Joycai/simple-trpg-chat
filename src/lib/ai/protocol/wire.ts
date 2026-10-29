import { invalid } from './errors';
import type { Wire, Status, ToolCall } from './types';
export function object(value: unknown): Wire { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Wire : {}; }
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function string(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function requiredString(value: unknown, label: string): string { return string(value) || invalid(`Missing ${label}`); }
export function checkEnvelope(data: Wire) {
  if (data.type === 'error' || data.error || (object(data.base_resp).status_code !== undefined && object(data.base_resp).status_code !== 0)) invalid('Upstream returned an error envelope');
}
export function stopStatus(reason: string, tools: boolean): Status {
  if (['length', 'max_tokens', 'MAX_TOKENS'].includes(reason)) return 'truncated';
  if (['content_filter', 'refusal', 'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'].includes(reason)) return 'blocked';
  if (!['stop', 'tool_calls', 'tool_use', 'end_turn', 'stop_sequence', 'STOP', 'completed'].includes(reason)) return 'incomplete';
  if (['tool_calls', 'tool_use'].includes(reason) && !tools) return 'incomplete';
  return tools ? 'tool_calls' : 'completed';
}
export function call(id: unknown, name: unknown, args: unknown): ToolCall {
  return { id: requiredString(id, 'tool call id'), type: 'function', function: { name: requiredString(name, 'tool name'), arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } };
}
export function validateCalls(calls: ToolCall[], strictArguments = true) {
  const ids = new Set<string>();
  for (const c of calls) {
    if (!c.id || ids.has(c.id) || !c.function.name) invalid('Invalid or duplicate tool call');
    ids.add(c.id);
    if (strictArguments) {
      try { const args: unknown = JSON.parse(c.function.arguments); if (!args || typeof args !== 'object' || Array.isArray(args)) invalid('Tool arguments must be an object'); }
      catch { invalid('Invalid tool arguments JSON'); }
    }
  }
}
export function texts(content: unknown): string {
  if (typeof content === 'string') return content;
  return array(content).map(p => string(object(p).text)).join('');
}
