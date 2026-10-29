# LLM protocol foundation

Implemented 2026-10-29. The room SSE contract is unchanged. Configuration now uses the shared [Vendor / Model editor](ai-vendor-model-settings.md). Existing provider rows with a null `protocol_config` still use non-streaming Chat Completions; selecting a vendor does **not** silently change protocol.

## Entry points and boundaries

`src/lib/ai/protocol/` contains four adapters (`chat`, `messages`, `responses`, `gemini`), a shared HTTP transport, typed request/response validation, capability settings and usage normalization. `completeForProvider()` is the accounting-aware entry point for bots, summaries, import, announcers and saved-provider connection tests. `complete()` / `streamCompletion()` are lower-level interfaces. Model listing reuses connection resolution and bounded HTTP transport.

The business layer consumes normalized text, tool calls, status and usage. A stream can be aggregated by `complete()` without changing when the UI displays text. The protocol layer does not execute tools or change permissions. Agent tool calls still execute sequentially with a whitelist, four tool rounds and one final prose round.

| Family | Base example | Authentication default | Continuation preserved |
| --- | --- | --- | --- |
| Chat | `https://api.openai.com/v1` | Bearer | `reasoning_content`, `reasoning`, `reasoning_details` |
| Messages | `https://api.anthropic.com/v1` | `x-api-key` + version | Full content blocks, including signatures and redacted thinking |
| Responses | `https://api.openai.com/v1` | Bearer | Full output items, including encrypted reasoning and function call IDs |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key` | Full parts and thought signatures; generated internal tool IDs pair results |

Only Chat-style function tools are exposed to business callers. Their schemas and choices are translated at the adapter boundary. Missing/duplicate call IDs, malformed argument JSON, unpaired results and cross-route continuation are rejected. Incomplete/blocked responses never lead to tool execution. `pause_turn` is an incomplete state, not an automatic continuation loop.

Continuation is scoped to provider ID, endpoint, protocol and actual requested model. It stays in server memory during the tool loop, is not stored in chat, and is not exposed as visible reasoning. Private continuation metadata is never serialized as a top-level wire field. Inline `<think>` content is separated from final prose.

## Migration and backend configuration

Apply [the additive SQL migration](../migrations/2026-10-29-llm-protocol.sql) before deploying this code, or use the repository schema deployment process. It adds `ai_providers.protocol_config` and `ai_usage_attempts`. Existing data and aggregate rows are retained. For rollback, deploy the previous application while retaining the additive objects and evidence; do not erase settled receipts.

Use the Admin or Host Vendor / Model editor for migrated models. The separate [Vendor migration](../migrations/2026-10-29-ai-vendors.sql) is required for that UI. The old flat create/update actions reject writes to linked models. For **unmigrated legacy rows only**, a local operator can use:

```sh
pnpm db:configure-ai-protocol <provider-id> <config.json>          # dry run
pnpm db:configure-ai-protocol <provider-id> <config.json> --apply
```

The endpoint already stored on the provider must match the chosen family. For example, change Google's compatibility base to its native base before enabling `gemini`; the existing endpoint field can still be used. The script never takes or prints API keys. It binds settings to the provider's current model; Bot overrides using a different model must have their configuration reviewed rather than inheriting the wrong effort profile.

Minimal configuration:

```json
{ "version": 1, "protocol": "responses", "model": "your-model-id" }
```

Optional fields: `endpointMode` (`base` or `full`), `auth` (`bearer`, `api-key`, `google-key`, `none`), `stream`, `maxOutputTokens`, `outputTokenField` (Chat only), `reasoning`, and `capabilities`. URLs must use HTTPS without inline credentials/query/fragment. Private and loopback targets remain blocked. Redirects are disabled; each retry revalidates its target.

Effort settings are **explicit capability declarations**, not an automatic model-name heuristic. For a Responses model documented to accept `high`, an example is:

```json
{
  "version": 1,
  "protocol": "responses",
  "model": "your-model-id",
  "reasoning": { "effort": "high" },
  "capabilities": { "effortMap": { "high": "high" } }
}
```

Reasoning output can also be requested explicitly with Responses `reasoning.summary`, Gemini `reasoning.includeThoughts`, and Messages `reasoning.display`; options are rejected on the wrong family. Business temperature defaults are omitted where declared unsupported or incompatible with Messages thinking, while explicitly conflicting temperature requests fail.

Unset means no extra parameter. `off` is distinct from `low`; each must have its own supported mapping when requested. Thinking on/off, effort, token budget and opaque continuation are separate concerns. Supported dialect declarations include Chat `thinking`/`enable_thinking`, Messages `adaptive`/`budget`/`thinking`, and Gemini `level`/`budget`. Budget reasoning must fit inside the output budget. Unsupported or contradictory settings fail before an HTTP request. Generic gateways are not presumed to support every field of an official endpoint.

Existing forms do not submit these hidden fields, and saving the old form preserves them. An incompatible model/endpoint edit returns a validation error. Setting `protocolConfig: null` explicitly restores legacy Chat behavior. Connection tests resolve matching owned endpoint/model/key records so existing test buttons can use the saved protocol without new controls; ambiguous matches fail rather than choosing a route arbitrarily.

## Failure and timeout semantics

HTTP 200 alone is insufficient. The adapters check error envelopes, required result shapes, stop reasons, refusals, truncation and stream termination. Streaming parsers bound input size, handle UTF-8 and split SSE frames, and retain known usage before failing. Protocol errors are sanitized; upstream response bodies and credentials are not sent to the room as diagnostics.

Default request timeout is 120 seconds; Agent adds a 300-second total loop deadline. Import retains 60 seconds, connection tests 10 seconds, and announcers their existing timeout. Streaming has a 60-second first-event/idle deadline. Timeouts cover response-body reads and retry delays. Only 429/502/503/504 may be retried, at most three attempts within the deadline. Cancellation, arbitrary network failures and post-output stream failures are not replayed. There is no automatic protocol switching or paid capability probing.

## Usage and settlement

Normalized usage separates input total, uncached input, cache reads/writes, output total and reasoning output. Missing fields remain null and the receipt records `reported`, `partial` or `missing`; missing usage is not evidence of zero consumption. Raw usage keeps numerical fields only, excluding arbitrary upstream strings.

- Chat/Responses reasoning is a subset of output, not an extra charge; cache aliases are not added twice.
- Messages input total includes its non-overlapping input/cache-read/cache-write buckets.
- Gemini output includes candidate and thought tokens; tool-use prompt input is included when reported.
- Usage is retained before empty text, refusals and parse failures are handled. Stream usage snapshots replace corresponding counters rather than being summed repeatedly; omitted nested counters retain earlier evidence.

`ai_usage_attempts` records a unique logical-generation ID, actual model/protocol, terminal status, normalized/raw usage and request-time rate snapshot. Pre-generation HTTP status retries are one logical generation; a tool loop has one receipt per generation. The receipt, daily aggregate and point deduction are transactional. Duplicate receipt IDs cannot deduct twice. Missing usage records evidence but makes no aggregate/point entry; partial usage records the known counts with its status retained. If only cached input is known, that count also contributes to the daily input total. Receipt values are authoritative for settlement. Point-log amounts equal the actual balance change, including when the nonnegative balance floor limits a deduction.

The three rate meanings remain unchanged; they are edited per model: non-cache-read input (including cache writes), cache reads and total output. These are the app's configured rates, not a claim of exact vendor billing. Usage persistence retries the same ID three times. If the database remains unavailable, a sanitized reconciliation receipt is logged; generation results are still delivered. Save that receipt JSON and replay it after recovery:

```sh
pnpm db:reconcile-ai-usage receipt.json            # dry run
pnpm db:reconcile-ai-usage receipt.json --apply    # idempotent
```

This requires retained application logs; it is not a durable external billing queue. Unknown usage cannot be reconstructed by retrying inference. Old aggregate records are not fabricated into per-request history.

## Verification and evidence

Contract fixtures are hand-authored against these official protocol references, reviewed 2026-10-29:

- [OpenAI reasoning and stateless continuation](https://developers.openai.com/api/docs/guides/reasoning)
- [Claude streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini generateContent reference](https://ai.google.dev/api/generate-content)
- [DeepSeek thinking mode and tool continuation](https://api-docs.deepseek.com/guides/thinking_mode/)

Automated coverage includes text/tool round trips for all four families, signatures, efforts, usage, response errors, cancellation, retry budgets, streaming, malformed tools, hidden configuration retention and existing Agent behavior. Real PostgreSQL settlement can be verified without changing application data:

```sh
node --env-file=.env --conditions=react-server --import tsx tests/database/ai-usage.ts
```

That check requires a local database with the migration applied; it creates and drops an isolated test schema. It exercises concurrent duplicate receipts, price snapshots, exact aggregates and missing usage evidence.

Offline protocol tests and a local database/browser check do not certify an arbitrary platform × route × model combination. No paid provider probes were run for this implementation. Native server tools, multimodal inputs, automatic capability discovery, credential schemes such as AWS SigV4 and provider-specific protocol extensions remain outside this foundation's scope.

The follow-up [implementation review](../../plans/llm-protocol-review.md) records compatibility fixes and regression evidence. Connection probes with saved reasoning/output budgets use those settings rather than the legacy five-token limit; their existing ten-second deadline remains in force.
