import type { Protocol, Usage, Wire } from './types';
import { object } from './wire';
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const sum = (...v: (number | null)[]): number | null => v.every(x => x === null) ? null : v.reduce<number>((s, x) => s + (x ?? 0), 0);
/** Stream usage is a cumulative snapshot; omitted nested counters retain earlier evidence. */
export function mergeUsage(previous: Wire, next: Wire): Wire {
  const merged: Wire = Object.assign(Object.create(null), previous);
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === null) continue;
    merged[key] = typeof value === 'object' && !Array.isArray(value)
      ? mergeUsage(object(previous[key]), object(value)) : value;
  }
  return merged;
}
// Usage is evidence, not a place for upstream arbitrary strings or private data.
function numericUsage(raw: Wire): Wire {
  const result: Wire = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) result[key] = numericUsage(object(value));
  }
  return result;
}
export function normalizeUsage(protocol: Protocol, raw: Wire = {}): Usage {
  let inputTotal: number | null, inputUncached: number | null, cacheRead: number | null, cacheWrite: number | null = null, outputTotal: number | null, reasoningOutput: number | null;
  if (protocol === 'messages') {
    inputUncached = count(raw.input_tokens); cacheRead = count(raw.cache_read_input_tokens); cacheWrite = count(raw.cache_creation_input_tokens);
    inputTotal = sum(inputUncached, cacheRead, cacheWrite); outputTotal = count(raw.output_tokens); reasoningOutput = null;
  } else if (protocol === 'gemini') {
    inputTotal = sum(count(raw.promptTokenCount), count(raw.toolUsePromptTokenCount)); cacheRead = count(raw.cachedContentTokenCount);
    reasoningOutput = count(raw.thoughtsTokenCount); outputTotal = sum(count(raw.candidatesTokenCount), reasoningOutput);
    inputUncached = inputTotal === null ? null : Math.max(0, inputTotal - (cacheRead ?? 0));
  } else {
    inputTotal = count(protocol === 'chat' ? raw.prompt_tokens : raw.input_tokens);
    cacheRead = count(object(protocol === 'chat' ? raw.prompt_tokens_details : raw.input_tokens_details).cached_tokens) ?? count(raw.prompt_cache_hit_tokens);
    outputTotal = count(protocol === 'chat' ? raw.completion_tokens : raw.output_tokens);
    reasoningOutput = count(object(protocol === 'chat' ? raw.completion_tokens_details : raw.output_tokens_details).reasoning_tokens);
    inputUncached = inputTotal === null ? null : Math.max(0, inputTotal - (cacheRead ?? 0));
  }
  // Impossible cache counts are not allowed to produce a negative/full-price credit.
  if (cacheRead !== null && inputTotal !== null) cacheRead = Math.min(cacheRead, inputTotal);
  const complete = protocol === 'messages' ? count(raw.input_tokens) !== null && count(raw.output_tokens) !== null : protocol === 'gemini' ? count(raw.promptTokenCount) !== null && count(raw.candidatesTokenCount) !== null : inputTotal !== null && outputTotal !== null;
  const status = complete ? 'reported' : Object.keys(raw).length ? 'partial' : 'missing';
  return { inputTotal, inputUncached, cacheRead, cacheWrite, outputTotal, reasoningOutput, status, raw: numericUsage(raw) };
}
