# Vendor / Model configuration

Admin `/admin/ai` and Host personal settings → AI services render the same
`AiCatalogManager`. Vendor owns credentials and one route per protocol; Model
owns display name, upstream model ID, selected protocol and protocol-scoped
settings. Admin models additionally expose sharing and per-million-token rates.
Shared models from other owners are read-only; no vendor credentials are returned.

## Storage and compatibility

- `ai_vendors`: owner, display name, platform preset, encrypted API key/hint,
  protocol routes (endpoint, base/full mode, optional authentication override).
- `ai_providers`: existing stable model IDs remain unchanged. Adds `vendor_id`
  and `protocol_settings`, keyed by protocol. Existing `protocol_config` is the
  active configuration; endpoint/key fields are an atomic materialized projection
  of its Vendor route for existing runtime callers and usage accounting.
- Vendor mutations lock the Vendor and update all active model projections in one
  transaction. Model mutations lock the same row. Deleting a nonempty Vendor or
  removing an active protocol fails. Models never silently switch protocols.
- Switching to a new protocol starts with unset parameters. Switching back
  restores its prior parameters, including opaque advanced configuration fields.
  No credential merging is inferred from names, endpoints or model IDs.
- Old create/update actions no longer modify linked models. The old protocol CLI
  rejects migrated models; use the editor. Do not run an old app version with
  writers against migrated data, because old writers do not maintain projections.

## Migration

Run `docs/migrations/2026-10-29-llm-protocol.sql` first when upgrading from before
four-protocol support, then **before deploying this UI**:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/2026-10-29-ai-vendors.sql
```

The transaction is additive and rerunnable. Each old model gets a separate Vendor;
IDs, encrypted keys, exact endpoints, active protocol settings and usage remain
unchanged. Similar names do not prove shared credentials, so no automatic merging.
The migration was applied to the local development database only.

Take a backup before deployment. For rollback, stop configuration writes and
restore application/database together from the backup; do not drop the new tables
while the new app is running. Runtime reads retain the old projection, but old
configuration writers cannot safely maintain this new ownership model.

## Behavior and scope

- Presets: the nine services listed below. Existing OpenRouter configurations remain editable. Endpoints stay
  editable. Model IDs can be entered manually or fetched from the saved Vendor's
  selected protocol, with owner-only credential resolution and SSRF validation.
- Presets are route suggestions, not certification of every model's capabilities.
  Sources checked 2026-10-29: [OpenRouter Responses](https://openrouter.ai/docs/api/api-reference/responses/create-responses),
  [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
  [DeepSeek endpoints](https://api-docs.deepseek.com/quick_start/agent_integrations/).
- Reasoning effort, wire-value mapping, thinking dialect, stream preference,
  context window, multimodal declaration and maximum output are editable per
  protocol. Unset does not imply support. Existing advanced fields survive saves.
- Streaming selects the existing complete/stream transport; it does not change
  chat delivery UX. Explicitly disabled streaming overrides a feature request.
- Maximum output bounds feature output requests. Blank retains protocol/feature
  defaults (Messages requires an output limit and currently defaults to 4096).
- Context window and multimodal input are declarations only. This change does not
  add media attachment messages or automatic token-count-based context trimming.
- Connection test operates on the saved model's explicit ID/configuration and uses
  existing usage receipts. It may incur vendor usage; tests here do not invoke it.
- Shared model rates remain per model. Host cannot share models or alter rates.
- Delete model retains prior deletion behavior (including associated usage deletion)
  with a themed confirmation explaining consequences. Vendor deletion requires no models.

## Validation

- Unit coverage: route mapping for all four protocols, isolation/restoration,
  invalid limits/efforts, missing routes, model rebinding, ownership/role checks,
  Vendor propagation, credential retention, and streaming/output request defaults.
- `tests/database/ai-vendors.ts`: local disposable schema, migration fidelity,
  rerun idempotency, same-name isolation and FK protection; cleans up its schema.
- `tests/e2e/ai-catalog.spec.ts`: Admin create/edit/delete, model persistence,
  protocol switching, custom dropdowns, and mobile width under six themes in both
  modes. Uses existing test login and cleans its fixtures. No paid model calls.
- Host browser smoke: create Vendor/model, edit/reload capacity fields, verify no
  sharing/rate fields, delete fixtures. Full lint/tests/build/i18n checks accompany
  the change. Real vendor generation is covered by the earlier protocol fixtures,
  not live certification.

Initial implementation results: lint and i18n checks passed; 81 unit-test files / 1,111 tests
passed; targeted Playwright run passed (setup + Admin scenario); disposable-schema
migration checks and Next.js compilation/runtime diagnostics passed. Production
build includes TypeScript validation. React DevTools tree CLI returned no usable
tree in this environment; runtime state persistence was checked through browser
reloads and protocol switches instead.

## Built-in Vendor presets (2026-10-29)

The creation menu offers, in order: OpenAI, Gemini, Claude, Alibaba Qwen,
Alibaba Qwen (Plan), ByteDance Volcano, ByteDance Volcano (Agent Plan), DeepSeek,
and Custom. Qwen Plan means **Token Plan Personal Edition**, not Coding Plan.
Domestic presets use Beijing endpoints; users can edit routes for their region or
workspace. Existing OpenRouter vendors retain their ID, label and saved routes;
OpenRouter is no longer suggested when creating a new Vendor. No migration or
rewrite of saved configurations is needed for this preset update.

| Preset | Default protocols | Base URLs |
| --- | --- | --- |
| Alibaba Qwen | Chat, Responses, Messages | `https://dashscope.aliyuncs.com/compatible-mode/v1`; Messages: `https://dashscope.aliyuncs.com/apps/anthropic` |
| Alibaba Qwen (Plan) | Chat, Responses, Messages | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`; Messages: `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` |
| ByteDance Volcano | Chat, Responses, Messages | `https://ark.cn-beijing.volces.com/api/v3`; Messages: `https://ark.cn-beijing.volces.com/api/compatible` |
| ByteDance Volcano (Agent Plan) | Chat, Responses, Messages | `https://ark.cn-beijing.volces.com/api/plan/v3`; Messages: `https://ark.cn-beijing.volces.com/api/plan` |

The Messages routes above explicitly use Bearer authentication, matching the
vendors' `ANTHROPIC_AUTH_TOKEN` configuration. The shared adapter appends
`/v1/messages`. Presets do not infer model IDs, price, context limits or reasoning
capabilities. Models remain manually configurable or discoverable when the
selected vendor endpoint supports the model-list API.

Official endpoint evidence:
- [Qwen Responses](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-responses)
- [Qwen Messages](https://help.aliyun.com/en/model-studio/claude-code)
- [Token Plan Personal quick start](https://docs.agent.bailian.aliyun.com/en/token-plan/token-plan-personal-quick-start)
- [Volcano API and Agent Plan endpoints](https://docs.volcengine.com/docs/ark/integrate-third-party-tools?lang=en)
- [Agent Plan Responses configuration](https://docs.volcengine.com/docs/ark/agent-plan-personal-openclaw?lang=en)
- [Agent Plan Messages configuration](https://docs.volcengine.com/docs/ark/agent-plan-personal-claude-code?lang=zh)

- [Token Plan Personal Responses configuration](https://help.aliyun.com/zh/model-studio/codex)

## Review fixes before PR

- Effort changes retain custom wire mappings. Legacy explicit thinking budgets are
  visible/editable; selecting an effort transfers its effective budget into that
  effort's mapping. Thinking toggles clear conflicting effort settings.
- Messages requests with thinking disabled do not emit an effort output_config.
- Host edits retain pre-existing hidden rates and sharing state; submitted sharing
  or rate changes still require Admin authorization.
- Empty model discovery results and completed-but-empty connection probes return
  errors instead of reporting success. Deletion failures appear inside the dialog.
- Migration takes a write-conflicting table lock before copying legacy records,
  preventing concurrent old configuration writes from splitting the snapshot.

Review validation: 81 unit-test files / 1,122 tests; targeted Playwright 3/3
(including setup), lint, i18n, TypeScript and production build; local disposable
PostgreSQL migration and usage-settlement integration checks. No live paid model
requests were made. Earlier Host manual smoke and six-theme light/dark mobile
layout coverage remain applicable. AGENTS.md local user edits are excluded.
