/**
 * Guard layer for the AI agent's tool-call dispatch (`src/lib/ai_agent.ts`).
 *
 * `enableTools` filters which tool *definitions* are advertised to the model,
 * but a model (or a misbehaving relay) can emit any tool name it likes — so
 * the execution side must enforce the same whitelist, or a disabled tool such
 * as `give_item` / `reveal_clue` / `send_image` could still be triggered
 * through prompt injection. Bad calls (unknown name, disabled tool, malformed
 * argument JSON) must degrade into a tool-result error the model can read and
 * correct — never an exception that kills the whole run.
 */

// The dispatch chain reads loosely-typed fields off the parsed arguments
// exactly as it did off JSON.parse's `any`; keeping that shape here avoids
// retyping 13 tool branches. Every branch already validates its own fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedToolArgs = Record<string, any>;

export type ToolCallGuardResult =
  | { ok: true; args: ParsedToolArgs }
  | { ok: false; error: string };

export function resolveToolCall(
  functionName: string,
  argsJson: string,
  enabledTools: readonly string[],
  knownToolNames: readonly string[]
): ToolCallGuardResult {
  if (!knownToolNames.includes(functionName)) {
    return {
      ok: false,
      error: `Unknown tool "${functionName}". Only call the tools provided in this conversation.`,
    };
  }
  if (!enabledTools.includes(functionName)) {
    return {
      ok: false,
      error: `Tool "${functionName}" is not enabled for you. Only call the tools provided in this conversation.`,
    };
  }

  // Some providers send "" (not "{}") for tools called without arguments.
  let parsed: unknown;
  try {
    parsed = argsJson.trim() === "" ? {} : JSON.parse(argsJson);
  } catch {
    return {
      ok: false,
      error: `Malformed JSON in the arguments for "${functionName}". Re-issue the call with valid JSON arguments.`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: `Arguments for "${functionName}" must be a JSON object. Re-issue the call with an object argument.`,
    };
  }
  return { ok: true, args: parsed as ParsedToolArgs };
}
