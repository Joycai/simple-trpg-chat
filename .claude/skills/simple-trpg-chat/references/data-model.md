# Data Model Reference

## Table Overview (16 tables)

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `users` | All accounts + bots | `role`, `is_bot`, `botConfigJson`, `aiPoints`, `isBanned` |
| `rooms` | Game sessions | `hostId`, `secretKey`, `theme`, `diceRules`, `ruleTemplate` |
| `room_members` | User-room membership | `nickname`, `characterData` (JSON), `avatarColor` |
| `messages` | Chat/dice/system messages | `type`, `audience` (owns visibility), `targetUserId`, `diceDetail` (JSON); `isPrivate` is a legacy derived mirror |
| `room_skills` | Per-user, per-room skills | `skillName`, `skillValue` (UNIQUE constraint) |
| `room_dm_reads` | DM read timestamps | `userId`, `partnerUserId`, `lastReadAt` |
| `inventory_items` | Item templates | `type` (info/character/item), `contentJson`, `imageUrl` |
| `inventory_distributions` | Who has what | `toUserId`, `viewed`, `action` (created/shared) |
| `clue_cards` | Clue templates | `title`, `content`, `imageUrl` |
| `clue_visibility` | Who can see which clue | `userId` (NULL = all) |
| `system_config` | Key-value settings | site title, default theme, sensitive word list |
| `ai_providers` | AI provider config per user | `ownerId`, `apiEndpoint`, `apiKeyEncrypted`, `model`, `isShared`, token rates |
| `ai_token_usages` | Daily token usage per user/provider | `userId`, `providerId`, `day`, `inputTokens`, `outputTokens` |
| `ai_point_logs` | AI point transaction audit trail | `userId`, `amount`, `beforePoints`, `afterPoints`, `type` |
| `daily_stats` | Daily visit + peak online counts | `date`, `visitCount`, `peakOnline` |
| `bot_presets` | Admin-managed bot templates | `name`, `systemPrompt`, `defaultNickname`, `allowEditPrompt` |
| `login_history` | Per-user login events | `userId`, `ipAddress`, `deviceType`, `loginAt` |

## Schema Definition

All tables defined in `src/db/schema.ts` using Drizzle ORM's `pgTable` (PostgreSQL only). Client in `src/db/index.ts` reads connection URL from `db.config.json` at project root.

## Extension Points

- `room_members.characterData` JSON — flexible character sheet (COC 7th or generic)
- `messages.type` includes `clue` — reserved for clue card push
- `messages.diceDetail` JSON — structured dice results with `check` metadata: `{ skillName, target, roll, success, grade }`
- `inventory_items.imageUrl` — image attachment support

## Bot-as-User Pattern

Bots are regular `users` rows with:
- `is_bot = true`
- `botConfigJson` JSON: `{ roomId, systemPrompt, model, activation, enableTools[], historicalSummary, lastSummarizedMsgId }`
- No separate bot table; bot presets (templates) are in `bot_presets` (admin-managed)

## AI Provider Pattern

Each host owns rows in `ai_providers`. API keys are AES-256-GCM encrypted (key: `AI_ENCRYPTION_KEY` env var). `isShared = true` makes a provider available to all users; non-admin usage of shared providers deducts from `users.aiPoints`.
