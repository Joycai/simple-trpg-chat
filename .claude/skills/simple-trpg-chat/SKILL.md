---
name: simple-trpg-chat
description: >-
  Expert knowledge for the Simple TRPG Chat project — a lightweight web-based TRPG tool built with Next.js 16, Drizzle ORM (SQLite/PostgreSQL), SSE real-time chat, AI Bot Agent, dice system, inventory, clue cards, character sheets, and multi-theme support. Use this skill whenever working on this project's codebase, adding features, fixing bugs, understanding the data model (12 tables), following development conventions (feature branches, PR workflow, pnpm, CI), or navigating the architecture (SSE privacy filter V3.15, Bot-as-User pattern, Server Actions, i18n with next-intl). Also use for questions about core concepts (Room, Bot, Dice, Character, Inventory, Clue, Private Chat, Markdown, Theme) or when troubleshooting common pitfalls.
---

# Simple TRPG Chat — Project Knowledge

## Overview

A lightweight, web-based TRPG (Tabletop Role-Playing Game) tool built with **Next.js 16 (App Router)**, supporting real-time chat, dice rolling, AI bot assistants, inventory management, clue cards, and character sheets.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack dev) |
| Language | TypeScript |
| ORM | Drizzle ORM (SQLite default, PostgreSQL optional) |
| Auth | NextAuth.js v5 (Credentials provider) |
| Realtime | SSE (Server-Sent Events via ReadableStream) |
| Styling | Tailwind CSS 4 + CSS Variables (4 themes) |
| i18n | next-intl (zh-CN / en) |
| Package Manager | pnpm |
| CI/CD | GitHub Actions (Node 20/22 matrix) |

### Repo
This skill is designed to work from the project root directory. All file paths below are relative to the repo root.

---

## Core Concepts

### 1. Room
A game session created by a **Host**. Players join with a secret key. Settings: name, theme, dice rules, rule template.
- **Schema**: `rooms` table
- **Key fields**: `theme` (default/parchment/cthulhu/shrine), `diceRules` (basic/coc7th), `ruleTemplate` (basic/coc7th), `secretKey`

### 2. User Roles
- **Admin**: Manages system config, creates accounts. Redirected to `/admin` on login.
- **Host (KP)**: Creates rooms, manages bots, distributes items/clues, initiates skill checks.
- **Player**: Joins rooms, chats, rolls dice, sets skills, receives items/clues.
- **Bot**: AI-powered virtual user (`users.is_bot = true`). Responds to @mentions or manual triggers.

### 3. Bot (AI Agent)
Bot-as-User architecture: Bots are regular `users` rows with `is_bot = true` and config stored in `botConfigJson`.
- **Memory**: System prompt + inventory items (knowledge base) + sliding window (20 recent messages) + historical summary
- **Activation**: `@mention` (auto-respond) or `manual` (host triggered via ⚡ button)
- **Tool Calls**: `send_message`, `roll_dice`, `inspect_item`, `search_history`, `my_inventory`, `my_clues`, `my_character`
- **Host can customize which tools are enabled** when creating/editing a bot
- **LLM**: Uses Host's AI config (`host_ai_config`) — OpenAI-compatible API
- **Config stored in**: `users.botConfigJson` JSON field

### 4. SSE Communication
Server-Sent Events for real-time message push.
- **Endpoint**: `GET /api/rooms/[id]/events`
- **Broadcast**: Memory EventEmitter via `globalThis` (dev HMR safe)
- **Heartbeat**: Every 15s to prevent proxy timeout
- **Client**: `EventSource` with auto-reconnect (3s delay), activity-triggered reconnect
- **Privacy Filter V3.15**: Targeted messages (`targetUserId`) → sender + target only. Generic private messages → sender + host.

### 5. Dice System
- **Direct roll**: `.rd<N>` command (e.g., `.rd100`, `.rd20`)
- **Skill check**: `.rc <skillName>` — d100 vs skill value
- **Skill setting**: `.st <name> <value>` — batch supported
- **Server-side calculation**: Results stored in `messages.diceDetail` JSON
- **COC 7th**: When `diceRules = "coc7th"`, rolls 01-05 = critical success, 96-100 = fumble
- **Host-initiated check**: Host → select players + skill → players click 🎲 to roll

### 6. Character Sheet
Per-user, per-room character data stored in `room_members.character_data` JSON.
- **COC 7th**: Auto-initialized with 8 attributes (STR/CON/SIZ/DEX/APP/INT/POW/EDU/LUCK) + derived (HP/SAN/MP/MOV/DB)
- **Generic d100**: Fully custom attributes
- **Panel**: 3 tabs (Attributes / Skills / Background) with HP bar, bio, custom attributes

### 7. Inventory System
Host creates items (info/character/item types), distributes to players (all or specific).
- **Tables**: `inventory_items` (templates) + `inventory_distributions` (who has what)
- **RPG Grid**: 4×N grid layout with emoji icons and theme-specific styling
- **Unread badge**: `viewed` flag on distributions, red badge on 📦 button
- **Sharing**: Players can share items with others; KP sees full history

### 8. Clue Card System
Host pre-creates clue cards, pushes to channel (public or targeted players).
- **Tables**: `clue_cards` + `clue_visibility`
- **Panel**: 🃏 button → player sees only visible clues
- **Theme**: Shrine=御札, Cthulhu=证物袋, Parchment=泛黄手稿

### 9. Private Chat (DM)
Point-to-point private messaging with TAB sidebar.
- **Left sidebar**: 🏠 Public + 🔒 DM conversations
- **Lock-in mode**: When in a DM tab, all messages auto-target the conversation partner
- **Unread badges**: Red animated badge with server-persisted read state (`room_dm_reads` table)
- **Resizable**: Drag to resize sidebar, collapsible

### 10. Markdown Rendering
All text messages support Markdown via lightweight custom renderer (`MarkdownRenderer.tsx`):
- Bold, inline code, strikethrough, links
- Headings (H1-H3), tables
- Code blocks with language labels

### 11. Theme System
CSS Variables + `data-theme` attribute on `<html>`. 4 themes with full component coverage.
| Theme | Key | Style |
|-------|-----|-------|
| Default | `default` | Dark tabletop, blue accent |
| Parchment | `parchment` | Warm paper, brown text, serif font |
| Cthulhu | `cthulhu` | Deep navy, teal glow |
| Shrine | `shrine` | Dark wood, vermilion accent |

### 12. AI Smart Import (#50)
Host pastes raw text → LLM analyzes → auto-splits into clues/info/items/characters → preview + edit → batch import.
- **Endpoint**: `analyzeTextForImportAction` (POST to Host's AI config)
- **Import**: `batchImportItemsAction` → writes to `inventory_items` + `clue_cards`

---

## Data Model (Key Tables)

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

---

## Core Flows

### Room Creation
1. Host clicks ＋ → fills name, key, theme, dice rules, rule template
2. Server creates room + auto-joins host
3. Players see room in lobby → enter key → join

### Message Flow (SSE)
1. Client sends via `sendMessageAction` (Server Action)
2. Server inserts to `messages` table
3. `broadcastToRoom(roomId, message)` → EventEmitter
4. SSE route receives → pushes to all connected clients
5. Client `EventSource.onmessage` → add to state (with dedup via `seenIdsRef`)

### Bot Activation
1. Message contains `@botNickname` → `runAgent(botUserId, roomId)` triggered
2. `buildAgentContext()`: system prompt + inventory items + sliding window(20) + historical summary
3. POST to host AI endpoint with tool definitions
4. LLM responds with text or function_call → tool executor runs → result back to LLM
5. Final response sent as chat message

### Dice Roll (.rc)
1. Player sends `.rc 侦查`
2. `executeCommand` → `handleRollCheck`
3. Server: random d100, check against skill value, apply COC rules if enabled
4. Result stored in `messages.diceDetail` with `check` metadata
5. Broadcast via SSE → rendered as dice card with success/fail/critical

### Item Distribution
1. Host creates item in Inventory panel
2. Clicks distribute → selects "all" or specific players
3. `distributeItemAction`: inserts `inventory_distributions` rows
4. Private notifications: target receives "获得道具", host sees "已发放"
5. Host excluded from "all" distribution

---

## Development Conventions

### Git Workflow
- `main` = release branch, **no direct push**
- Feature branches: `feature/<name>` — created by PM (@Anela) during planning
- Work on branch → push → create PR → CI checks → review → merge to main

### Role Assignments
- **@Anela (Angela)**: PM — requirements, task breakdown, assignment, acceptance
- **@Shizuku**: All development (backend + frontend)
- **@nagisa**: Code review only (no direct code changes)
- **@水月**: UI/UX design
- **@Janney**: Documentation + progress tracking

### Commands
```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm db:push      # Sync Drizzle schema to SQLite
pnpm db:studio    # Drizzle Studio (DB browser)
bash setup.sh     # First-time setup (generates .env, installs deps, pushes schema)
```

### Key Files
| File | Purpose |
|------|---------|
| `src/db/schema.ts` | All Drizzle ORM table definitions |
| `src/db/index.ts` | DB adapter (SQLite/PostgreSQL switching) |
| `src/app/actions/room.ts` | Room, message, dice, skill check actions |
| `src/lib/ai_agent.ts` | Bot Agent: context builder, LLM client, tool executor |
| `src/lib/commands.ts` | `.st` / `.rc` / `.rd` command parser |
| `src/components/RoomClient.tsx` | Main room interface (760+ lines, core component) |
| `src/app/api/rooms/[id]/events/route.ts` | SSE endpoint |
| `src/app/globals.css` | Theme CSS variables + Tailwind @theme |
| `src/instrumentation.ts` | Server startup hook (DB init) |
| `.github/workflows/ci.yml` | CI: lint → tsc → build |

### Common Patterns
- **Server Actions**: `"use server"` functions in `src/app/actions/` — called from client components
- **Privacy**: `isPrivate` + `targetUserId` pattern for targeted messages
- **Component integration**: New panels must be imported AND rendered in `RoomClient.tsx` (common omission)
- **DB schema changes**: Require `pnpm db:push` + dev server restart
- **i18n**: Use `useTranslations()` in client, `getTranslations()` in server components

---

## Known Pitfalls & Troubleshooting

### Integration & Rendering
1. **Component not rendered (recurring!)**: New panels (SkillPanel, ClueManager, ConversationPanel, AiImportPanel) were repeatedly created with import + state but **missing JSX render**. Always verify `<NewPanel />` exists in both the import AND the return block of RoomClient. Two people adding the same component = duplicate buttons.
2. **Drizzle innerJoin data shape**: `.select().from(A).innerJoin(B, ...)` returns `{ a: {...}, b: {...} }`, NOT flat fields. Access `p.room_members?.nickname` not `p.nickname`, or fallback `p.users?.displayName`. Otherwise displays show "?".

### Real-time & SSE
3. **Duplicate messages**: Caused by (a) optimistic update with `Date.now()` temp ID + SSE broadcast with real DB ID, or (b) HMR listener accumulation in dev mode. Fix: per-stream `sentIds` Set on server + `seenIdsRef` Set on client for absolute dedup.
4. **SSE privacy filter V3.15**: Targeted messages (`targetUserId` set) → sender + target only (host NOT auto-included). Generic private messages → sender + host. Mixing these up causes "KP sees player notifications" or "sender can't see own message in DM tab".

### Database & Schema
5. **Schema changes need db:push + restart**: Adding columns (like `viewed`, `ruleTemplate`) compiles fine but SQLite rejects at runtime with `no such column`. Always run `pnpm db:push` and restart `pnpm dev` after schema.ts changes.
6. **instrumentation.ts required**: `initDb()` must be called on server startup via `src/instrumentation.ts` → `register()`. Without it, PostgreSQL switching never activates.

### Runtime & Environment
7. **Edge Runtime vs Node.js modules**: `proxy.ts` (middleware) runs in Edge by default — cannot import `better-sqlite3`, `fs`, or any native module. Use `auth.config.ts` for lightweight config, keep DB imports in Server Components/Actions only.
8. **pnpm native modules**: After `pnpm install`, `better-sqlite3` may need `pnpm rebuild better-sqlite3` for binary bindings. Linux requires GCC 11+ (C++20 support). CI runs `pnpm install --frozen-lockfile`.
9. **`package-lock.json` removed**: Only `pnpm-lock.yaml` is used. `npm ci` will fail — use `pnpm install --frozen-lockfile` in CI.
