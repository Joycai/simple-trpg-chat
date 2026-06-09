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

All file paths below are relative to the project root.

---

## Core Concepts (Quick Reference)

| Concept | Key Idea | Details |
|---------|----------|---------|
| **Room** | Game session with key-based access | `rooms` table, theme/diceRules/ruleTemplate settings |
| **User Roles** | Admin / Host(KP) / Player / Bot | Admin→`/admin`, Host manages rooms, Bot is virtual user |
| **Bot (AI Agent)** | Bot-as-User: `is_bot=true`, config in `botConfigJson` | 7 tools, @mention or manual activation, LLM via host_ai_config |
| **SSE** | `GET /api/rooms/[id]/events` | globalThis EventEmitter, 15s heartbeat, V3.15 privacy filter |
| **Dice** | `.rd<N>` / `.rc <name>` / `.st <name> <value>` | Server-side calculation, COC 7th critical/fumble |
| **Character** | `room_members.character_data` JSON | COC7th auto-init 8 attrs + derived, or generic d100 |
| **Inventory** | `inventory_items` + `inventory_distributions` | RPG grid, unread badges, host-excluded "all" distro |
| **Clue Cards** | `clue_cards` + `clue_visibility` | Host creates, pushes to channel, visibility-controlled |
| **DM/Private Chat** | Left TAB sidebar, lock-in mode | `room_dm_reads` for persisted unread state |
| **Markdown** | Lightweight custom renderer | Headings, tables, code blocks, inline formatting |
| **Theme** | CSS Variables + `data-theme` | 4 themes: default/parchment/cthulhu/shrine |
| **AI Import** | Paste text → LLM splits → batch import | `analyzeTextForImportAction` → inventory_items + clue_cards |

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

### Commands
```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm db:push      # Sync Drizzle schema to SQLite
pnpm db:studio    # Drizzle Studio (DB browser)
bash setup.sh     # First-time setup (.env, deps, schema)
```

### Key Files
| File | Purpose |
|------|---------|
| `src/db/schema.ts` | All table definitions |
| `src/db/index.ts` | DB adapter (SQLite/PG switching) |
| `src/app/actions/room.ts` | Room, message, dice actions |
| `src/lib/ai_agent.ts` | Bot Agent engine |
| `src/lib/commands.ts` | `.st` / `.rc` / `.rd` parser |
| `src/components/RoomClient.tsx` | Main room UI (760+ lines) |
| `src/app/api/rooms/[id]/events/route.ts` | SSE endpoint |
| `src/app/globals.css` | Theme CSS variables |
| `src/instrumentation.ts` | Server startup hook |
| `.github/workflows/ci.yml` | CI pipeline |

### Common Patterns
- **Server Actions**: `"use server"` in `src/app/actions/` — called from client
- **Privacy**: `isPrivate` + `targetUserId` pattern
- **Component integration**: Must import AND render in RoomClient (common omission)
- **DB changes**: `pnpm db:push` + restart dev server
- **i18n**: `useTranslations()` client, `getTranslations()` server

---

## Reference Files

For detailed information, read these files as needed:

- **`references/data-model.md`** — Complete table schemas with columns, constraints, and extension points. Read when working on schema changes, adding new tables, or understanding data relationships.
- **`references/core-flows.md`** — Step-by-step flows for Room creation, SSE messaging, Bot activation, Dice rolls, Item distribution, and AI Smart Import. Read when implementing or debugging these features.
- **`references/pitfalls.md`** — 10 recurring issues with root causes and fixes. Read when troubleshooting bugs, especially around component rendering, SSE duplicates, database sync, or environment setup.
