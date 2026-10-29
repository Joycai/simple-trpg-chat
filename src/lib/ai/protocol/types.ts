export type Protocol = 'chat' | 'messages' | 'responses' | 'gemini';
export type Wire = Record<string, unknown>;
export type Effort = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface Tool { type: 'function'; function: { name: string; description?: string; parameters: Wire } }
export interface Message {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Never serialized except by its originating adapter. */
  continuation?: { source: string; payload: unknown };
}
export interface Usage {
  inputTotal: number | null;
  inputUncached: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  outputTotal: number | null;
  reasoningOutput: number | null;
  status: 'reported' | 'partial' | 'missing';
  raw: Wire;
}
export type Status = 'completed' | 'tool_calls' | 'truncated' | 'blocked' | 'incomplete';
export interface Completion { message: Message; reasoning: string; status: Status; stopReason: string; usage: Usage; attemptId: string }
export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  maxOutputTokens?: number;
  temperature?: number;
  /** Business default, omitted when the model/protocol cannot accept temperature. */
  defaultTemperature?: number;
  reasoning?: { effort?: Effort; enabled?: boolean; budgetTokens?: number; summary?: 'auto' | 'concise' | 'detailed'; includeThoughts?: boolean; display?: 'summarized' | 'omitted' };
  signal?: AbortSignal;
  timeoutMs?: number;
  deadlineMs?: number;
  stream?: boolean;
}
export type CompletionEvent = { type: 'text' | 'reasoning'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; result: Completion };
export interface Adapter {
  build(request: CompletionRequest, source: string): Wire;
  parse(data: unknown, source: string): Omit<Completion, 'attemptId'>;
  accumulator(): Accumulator;
}
export interface Accumulator { push(data: Wire): CompletionEvent[]; finish(): unknown; usage(): Wire }
