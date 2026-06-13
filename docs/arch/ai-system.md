# AI System

## Bot Users

Bots are regular `users` rows with `isBot: true` and `botConfigJson` holding their AI configuration. Bot presets (admin-managed templates) live in the `botPresets` table.

## Agent Loop (`src/lib/ai_agent.ts`)

Runs an OpenAI-compatible tool-use loop triggered when a message is sent in a room that has an active bot. Summarizes history incrementally after every 30 messages.

### Supported Tools (8)

| Tool | Description |
| ---- | ----------- |
| `roll_dice` | Roll dice (1–20 dice, 1–1000 faces); optional privacy flag |
| `send_message` | Send a message to the room — **currently disabled** (filtered out at runtime) |
| `inspect_item` | Read an inventory item's details (validates ownership) |
| `search_history` | Search chat history by keyword (up to 20 results) |
| `my_inventory` | List all items in the bot's inventory |
| `my_clues` | List all clue cards revealed to the bot |
| `my_character` | Read the bot's character sheet (attributes, HP/SAN/MP, skills) |
| `set_character_card` | Write/update the bot's character sheet |

## AI Providers

Each host configures their own provider via the `aiProviders` table:
- API endpoint + model are stored in plaintext; API keys are AES-256-GCM encrypted (`src/lib/encryption.ts`).
- `AI_ENCRYPTION_KEY` env var is the encryption key (falls back to `dev-secret-key` in dev).
- SSRF guard (`src/lib/url-guard.ts`) rejects endpoints that resolve to private/loopback IPs.
- Admin can mark a provider as `isShared` to make it available to all users.

## Token Usage & Points

- Every AI call records token counts in `aiTokenUsages` (daily aggregation per user/provider) via `src/lib/ai_usage.ts`.
- When a non-admin user invokes a **shared** provider, `aiPoints` are deducted from their balance (`users.aiPoints`).
- Deduction is logged in `aiPointLogs` for auditing.
- Users can view their own usage and point balance via `UserSettingsPanel.tsx`.
- Admins see full cross-user usage in `/admin/usage` (`TokenUsageDashboard.tsx`).

## Bot Presets

Admin-created templates in `botPresets` (system prompt, default nickname, `allowEditPrompt` flag). Applied when creating or configuring bot users. Managed via `/admin/ai` (`AdminBotPresets.tsx`).
