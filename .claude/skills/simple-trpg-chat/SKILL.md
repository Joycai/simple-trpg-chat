---
name: simple-trpg-chat
description: >-
  Expert knowledge for the Simple TRPG Chat project — a lightweight web-based TRPG tool built with Next.js 16, Drizzle ORM (PostgreSQL), SSE real-time chat, AI Bot Agent, dice system, inventory, clue cards, character sheets, and multi-theme support. Use this skill whenever working on this project's codebase, adding features, fixing bugs, understanding the data model (16 tables), following development conventions (feature branches, PR workflow, pnpm, CI), or navigating the architecture (message audience router, Bot-as-User pattern, Server Actions, i18n with next-intl). Also use for questions about core concepts (Room, Bot, Dice, Character, Inventory, Clue, Private Chat, Markdown, Theme) or when troubleshooting common pitfalls.
---

# Simple TRPG Chat — Project Knowledge

> Tech stack, commands, and project structure are in `CLAUDE.md`. This skill covers non-obvious concepts, conventions, and gotchas.

## Core Concepts (Non-obvious only)

| Concept | Key Idea |
|---------|----------|
| **Bot (AI Agent)** | Bot-as-User: `is_bot=true` + `botConfigJson`. 8 tools. Triggered by @mention. LLM via `ai_providers` table (AES-256-GCM encrypted keys). |
| **Message Audience Router** | Central visibility model in `src/lib/messaging/`. Two orthogonal dims: `audience` (WHO: `everyone`/`self`/`recipient` target-only/`directed` actor+target/`dm`/`gm`) + `channelUserId` (WHERE: null=public, else the DM it renders in). Senders call `dispatchMessage({ audience, channelPartnerId? })`; consumers use `canSee` / `channelOf` / `countsAsDmUnread` / `messageVisibilityWhere`. No scattered `isPrivate`/type sniffing. |
| **DM/Private Chat** | `audience='dm'` between two users. `room_dm_reads` tracks unread per pair. Rendered in left-sidebar tab. |
| **Character** | `room_members.character_data` JSON. COC 7th: 8 core attrs + derived (HP/SAN/MP). Skills in separate `room_skills`, synced for sanity. |
| **AI Import** | Host pastes raw text → LLM splits → batch import into `inventory_items` + `clue_cards`. |
| **AI Points** | Non-admin usage of shared providers deducts from `users.aiPoints`. Logged in `ai_point_logs`. |

---

## Development Conventions

### Git Workflow
- `main` = release branch, **no direct push**
- Feature branches: `feature/<name>` → push → PR → CI → review → merge

### Role Assignments
- **@Anela (Angela)** — PM: requirements, task breakdown, assignment, acceptance
- **@Shizuku** — All development (backend + frontend)
- **@nagisa** — Code review only (no direct code changes)
- **@水月** — UI/UX design
- **@Janney** — Documentation + progress tracking

---

## Key Files

| File | Purpose |
|------|---------|
| `src/db/schema.ts` | All 16 table definitions |
| `src/lib/ai_agent.ts` | Bot Agent engine (8 tools) |
| `src/lib/commands.ts` | `.st` / `.rc` / `.sc` / `.rd` parser |
| `src/lib/messaging/audience.ts` | Pure visibility predicates (`canSee`/`channelOf`/`countsAsDmUnread`) — shared client+server |
| `src/lib/messaging/router.ts` | `dispatchMessage()` (insert+broadcast) + `messageVisibilityWhere()` SQL |
| `src/lib/events.ts` | globalThis EventEmitter singleton |
| `src/components/RoomClient.tsx` | Main room UI orchestrator |
| `src/app/api/rooms/[id]/events/route.ts` | SSE endpoint |
| `src/app/globals.css` | Theme CSS variables |

## Common Patterns

- **Server Actions**: `"use server"` in `src/app/actions/` — called from client components
- **Messaging**: never insert into `messages` directly — call `dispatchMessage()` with a semantic `audience`. Never hand-set `isPrivate`/`targetUserId` for visibility
- **Component integration**: Must import AND render in `RoomClient` — common omission when adding panels
- **DB changes**: `pnpm db:push` + restart dev server after `schema.ts` edits
- **i18n**: `useTranslations()` client-side, `getTranslations()` server-side

---

## Reference Files

Read on demand — not auto-loaded:

- **`references/data-model.md`** — 16-table schema with columns and extension points. Read when working on schema changes or understanding data relationships.
- **`references/core-flows.md`** — Step-by-step flows: Room creation, SSE messaging, Bot activation, Dice rolls, Item distribution, AI Smart Import.
- **`references/pitfalls.md`** — 10 recurring issues with root causes and fixes. Read when troubleshooting SSE, database, or environment issues.
