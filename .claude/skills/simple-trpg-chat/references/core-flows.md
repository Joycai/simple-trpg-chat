# Core Flows Reference

## Room Creation
1. Host clicks ＋ → fills name, key, theme, dice rules, rule template
2. Server `createRoomAction` → inserts `rooms` row → auto-joins host via `room_members`
3. Players see room in lobby → enter key → `joinRoomAction` validates key → inserts `room_members`

## Message Flow (SSE)
1. Client sends via `sendMessageAction` (Server Action in `src/app/actions/room.ts`)
2. Server inserts to `messages` table
3. `broadcastToRoom(roomId, message)` → EventEmitter (persisted on `globalThis` for HMR safety)
4. SSE route `GET /api/rooms/[id]/events` receives → pushes to all connected clients
5. Client `EventSource.onmessage` → add to state (with dedup via `seenIdsRef` Set)
6. Heartbeat every 15s to prevent proxy timeout

## Bot Activation
1. Message contains `@botNickname` (or is a DM to the bot) → `runAgent(botUserId, roomId)` triggered (in `src/lib/ai_agent.ts`). Bots with `activation: "manual"` skip these auto-triggers and only run on explicit host acts (trigger button, check requests) — resolver `botActivationMode` in `src/lib/botStatus.ts`. A 3s per-bot cooldown throttles auto-triggers; explicit host acts bypass it.
2. `buildAgentContext()` assembles: system prompt + rule module's AI prompt + inventory items (knowledge base) + sliding window (50 recent messages) + historical summary
3. POST to Host AI endpoint (`ai_providers`) with tool definitions (13 tools, per-bot `enableTools` filter)
4. LLM responds with text OR function_call → tool executor runs → result fed back to LLM
5. Free-text content is broadcast directly via `dispatchMessage` (no tool needed)
6. History compression: when messages exceed threshold (30), old messages summarized into `historicalSummary`

## Dice Roll (.rc command)
1. Player sends `.rc 侦查`
2. `executeCommand` → `handleRollCheck` (in `src/lib/commands.ts`)
3. Server: random d100, check against `room_skills` value
4. If `diceRules = "coc7th"`: 01-05 = critical success (🟢), 96-100 = fumble (🔴)
5. Result stored in `messages.diceDetail` JSON with `check` metadata: `{ skillName, target, roll, success, grade }`
6. Broadcast via SSE → rendered as dice card

## Item Distribution
1. Host creates item template in Inventory panel → `createInventoryItemAction`
2. Clicks distribute → selects "all" or specific players
3. `distributeItemAction`: inserts `inventory_distributions` rows (host excluded from "all")
4. Notifications via `dispatchMessage`: each target gets "获得了新道具" (`audience: 'directed'` — host + that player, inline in public). Host gets "已向全体/玩家发放道具" (`audience: 'gm'`).
5. Players see items in RPG grid backpack with unread badge

## AI Smart Import (#50)
1. Host pastes raw text → `analyzeTextForImportAction`
2. LLM (via `ai_providers`) analyzes text → returns structured JSON: `[{ type, title, content }]`
3. Preview list with type icons, editable content
4. Confirm → `batchImportItemsAction` writes to `inventory_items` + `clue_cards`
