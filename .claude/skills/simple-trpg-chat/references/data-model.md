# Data Model Reference

## Table Overview (12 tables)

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `users` | All accounts + bots | `role`, `is_bot`, `botConfigJson` |
| `rooms` | Game sessions | `hostId`, `secretKey`, `theme`, `diceRules`, `ruleTemplate` |
| `room_members` | User-room membership | `nickname`, `characterData` (JSON) |
| `messages` | Chat/dice/system messages | `type`, `isPrivate`, `targetUserId`, `diceDetail` (JSON) |
| `room_skills` | Per-user, per-room skills | `skillName`, `skillValue` (UNIQUE constraint) |
| `inventory_items` | Item templates | `type` (info/character/item), `contentJson`, `imageUrl` |
| `inventory_distributions` | Who has what | `toUserId`, `viewed`, `action` (created/shared) |
| `clue_cards` | Clue templates | `title`, `content`, `imageUrl` |
| `clue_visibility` | Who can see which clue | `userId` (NULL = all) |
| `system_config` | Key-value settings | `ai_enabled`, `db_type`, `pg_url` |
| `host_ai_config` | Host AI API settings | `apiEndpoint`, `apiKeyEncrypted`, `model` |
| `room_dm_reads` | DM read timestamps | `partnerUserId`, `lastReadAt` |

## Schema Definition
All tables defined in `src/db/schema.ts` using Drizzle ORM's `sqliteTable`. Database adapter in `src/db/index.ts` supports SQLite (default) and PostgreSQL (via `system_config.db_type`).

## Extension Points
- `room_members.characterData` JSON — flexible character sheet storage
- `messages.type` includes `clue` — reserved for clue card push
- `messages.diceDetail` JSON — structured dice roll results with `check` metadata
- `inventory_items.imageUrl` — reserved for future image support

## Bot-as-User Pattern
Bots are regular `users` rows with:
- `is_bot = true`
- `botConfigJson` JSON containing: `{ roomId, systemPrompt, model, activation, enableTools[], historicalSummary, lastSummarizedMsgId }`
- No separate bot table needed
