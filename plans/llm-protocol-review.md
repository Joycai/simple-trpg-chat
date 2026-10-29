# LLM protocol implementation review — 2026-10-29

Scope: Chat Completions, Messages, Responses and Gemini GenerateContent; reasoning/tool continuation, usage settlement and failure handling. UI components, translations and user interaction flows are unchanged. Changes remain on `codex/llm-protocol-foundation`.

## Findings fixed

| Finding | Fix and regression evidence |
| --- | --- |
| Chat SSE ignored `[DONE]`, so a complete response on an open connection could time out. | End consumption and cancel the reader on the sentinel. Test uses an intentionally open HTTP body. Adapter terminal validation still rejects an incomplete turn. |
| Streamed Chat reasoning details were appended as separate blocks, breaking indexed text/summary replay; alternating reasoning fields were conflated. | Merge text/summary/signature fragments by block index/type/compatible ID, preserve the two field names independently and keep encrypted blobs discrete. Test verifies the next tool-result request. Preserve standalone `encrypted_content` as well. |
| A trailing partial `<think>` tag was missing from text deltas even though it existed in the final result. | Flush the splitter at the finish reason; streamed text and final text agree. |
| Shallow usage snapshot updates discarded earlier nested cache counters. | Merge nested cumulative snapshots without adding cumulative counts. Use prototype-free dictionaries so upstream object keys cannot fabricate inherited counters. |
| Partial cached usage could produce a daily input total smaller than cached input; callers could pass totals inconsistent with the receipt. | Derive settlement counters from the authoritative receipt, include known cache input when total is missing, and retain partial status/null evidence in the receipt. |
| With insufficient balance, point-log amount differed from the actual balance change. | Record the actual deduction; full consumption and request-time rate evidence remain available in the receipt. Existing nonnegative balance behavior is preserved. |
| A request could change model after connection/source resolution, bypassing continuation isolation. | Bind connection to its model and reject mismatches before network access. Reject role-incompatible message fields, malformed runtime reasoning and invalid timers. |
| A tool finish reason without calls could be reported as a completed text answer. | Mark it incomplete for Chat/Messages. |
| Saved thinking settings conflicted with the connection probe's hard-coded five-token output cap. | Let the shared client apply saved reasoning/output budgets. Unsaved legacy Chat keeps its five-token probe; the ten-second timeout and UI stay unchanged. |

## Coverage and verification

- All four protocols: non-stream and stream tool continuation, opaque reasoning/signature preservation, malformed history, errors, and error-event usage retention.
- Existing coverage retained for truncation, refusals, missing terminal events, duplicate tool IDs, incomplete JSON, timeout/cancellation, bounded response reads, retry deadlines and Agent side-effect limits.
- `pnpm lint`: passed.
- `pnpm test`: 78 files, 1088 tests passed (24 added in this review).
- `pnpm build`: passed, including TypeScript checking.
- Local PostgreSQL disposable-schema integration: concurrent receipt deduplication, rate snapshots, missing and partial usage, balance/log consistency passed; test schema removed.
- Browser smoke: restored existing host session; lobby, personal settings and AI provider list loaded. Next.js MCP returned no compilation issues or runtime errors. No connection-test button was invoked.
- `git diff --check`: passed; no component or translation changes.

## Evidence and limits

Protocol fixtures are deterministic local tests, not live model certification. No paid model calls were made. Vendor/model-specific capabilities remain explicit configuration; opaque extension formats other than those documented/tested here are not automatically certified.

References consulted:

- [OpenAI Chat streaming contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): usage precedes the terminal sentinel.
- [OpenRouter provider reasoning summary issue](https://github.com/OpenRouterTeam/ai-sdk-provider/issues/519): first-party repository report of fragmented reasoning replay; used as a regression scenario, not proof for all gateways.
- [Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures): signed empty parts and full response continuation.
- [Claude thinking](https://platform.claude.com/docs/en/build-with-claude/thinking): model/mode-specific reasoning constraints; forced-tool compatibility must remain capability-specific.
