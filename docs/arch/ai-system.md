# AI System

## Bot Users

Bots are regular `users` rows with `isBot: true` and `botConfigJson` holding their AI configuration. Bot presets (admin-managed templates) live in the `botPresets` table.

## Agent Loop (`src/lib/ai_agent.ts`)

Runs an OpenAI-compatible tool-use loop triggered when a message is sent in a room that has an active bot. Summarizes history incrementally after every 30 messages.

### Supported Tools (9)

Free-text replies are **not** a tool — they are broadcast directly from the model's message content (R3), so a bot can always talk even with zero tools enabled. Which tools a bot may call is configured per bot (`botConfigJson.enableTools`); default is `["roll_dice", "respond_check"]`.

| Tool | Description |
| ---- | ----------- |
| `roll_dice` | Roll dice (1–20 dice, 1–1000 faces); optional privacy flag |
| `respond_check` | Respond to a host-issued skill/sanity check targeting the bot — rolls `.rc`/`.sc` against its own sheet, records `respondedUserIds`, broadcasts `check_update` (same as a player clicking the check message) |
| `send_image` | Show an image — an internal `/api/rooms/<thisRoom>/images/…` path or a public `https://` URL (http and other rooms' paths rejected) — see [`send_image` trust model](#send_image-trust-model) |
| `inspect_item` | Read an inventory item's details (validates ownership) |
| `search_history` | Search chat history by keyword (up to 20 results) |
| `my_inventory` | List all items in the bot's inventory |
| `my_clues` | List all clue cards revealed to the bot |
| `my_character` | Read the bot's character sheet (attributes, HP/SAN/MP, skills) |
| `set_character_card` | Write/update the bot's character sheet (COC attrs clamped 0–99, skills 0–999) |

### `send_image` trust model

Any `https://` URL is accepted — the server does **not** fetch the image, so there is no SSRF risk. The URL is broadcast as-is and rendered in players' browsers via `<img src>`.

This is intentionally broad so a host can let their bot illustrate a scene with any public image, but it does mean a bot can technically:
- broadcast tracking-pixel URLs or arbitrary marketing imagery,
- link to images the host has not vetted (NSFW, low-quality, etc).

A bot can only do this if the host enabled `send_image` in its `enableTools` array. Hosts who treat their bot as semi-trusted (e.g. an external preset) should leave `send_image` disabled and rely on `inspect_item` + text replies for visual references.

## AI Providers

Each host configures their own provider via the `aiProviders` table:
- A provider is one **vendor + model** pair. The create/edit form is two-level: pick a vendor first (OpenAI / Google GenAI / Claude / DeepSeek / OpenAI-compatible third party), then a model. The vendor registry lives in `src/lib/provider-presets.ts` (`AI_VENDORS`): default endpoint, badge, model presets with per-1M token rates, and how to list models. `aiProviders.vendor` stores the chosen vendor id (legacy rows default to `openai-compatible`).
- The chat path is uniformly OpenAI-compatible (`{endpoint}/chat/completions` + Bearer key) for every vendor — Google and Claude go through their official OpenAI-compatibility endpoints (`…/v1beta/openai`, `api.anthropic.com/v1`), so `ai_agent.ts` needs no per-vendor branching.
- Model listing is vendor-aware: `fetchProviderModels` (server action in `ai-providers.ts`) GETs `{endpoint}/models` with Bearer auth, except the Claude vendor which uses `x-api-key` + `anthropic-version`. Request building and response parsing are pure functions in `src/lib/model-fetch.ts`. The form's `ModelPicker.tsx` combobox shows vendor preset models and can pull the live list (using the typed key, or the stored key when editing).
- API endpoint + model are stored in plaintext; API keys are AES-256-GCM encrypted (`src/lib/encryption.ts`).
- `AI_ENCRYPTION_KEY` env var is the encryption key (falls back to `dev-secret-key` in dev).
- SSRF guard (`src/lib/url-guard.ts`) resolves the endpoint hostname via DNS and rejects it if any resolved address is private/loopback/link-local (also checked against literal IPv4/IPv6 forms, including IPv4-mapped IPv6). Applied both when a provider is saved and again immediately before every outbound call (`ai_agent.ts`, `ai-import.ts`, `testAiConnection`), and by `fetchProviderModels` before listing models, since DNS can change between the two.
- Admin can mark a provider as `isShared` to make it available to all users.

## Token Usage & Points

- Every AI call records token counts in `aiTokenUsages` (daily aggregation per user/provider) via `src/lib/ai_usage.ts`.
- When a non-admin user invokes a **shared** provider, `aiPoints` are deducted from their balance (`users.aiPoints`).
- Deduction is logged in `aiPointLogs` for auditing.
- Users can view their own usage and point balance via `UserSettingsPanel.tsx`.
- Admins see full cross-user usage in `/admin/usage` (`TokenUsageDashboard.tsx`).

## Bot Presets

Admin-created templates in `botPresets` (system prompt, default nickname, `allowEditPrompt` flag). Applied when creating or configuring bot users. Managed via `/admin/ai` (`AdminBotPresets.tsx`).
