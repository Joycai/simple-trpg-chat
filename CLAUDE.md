# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

**Simple TRPG Chat** — lightweight web-based TRPG tool (Call of Cthulhu, D&D) with multi-player chat, dice, skill checks, inventory, clue cards, character sheets, and optional AI bot NPCs.

## Tech Stack

| Layer      | Technology                                          |
| ---------- | --------------------------------------------------- |
| Framework  | Next.js 16.2.6 (App Router)                        |
| Language   | TypeScript 5                                        |
| React      | React 19                                            |
| Styling    | Tailwind CSS v4 (`@tailwindcss/postcss`)            |
| Database   | PostgreSQL via `postgres` + Drizzle ORM             |
| Auth       | NextAuth v5 beta, Credentials provider              |
| i18n       | `next-intl` v4 (zh/en, default: zh)                |
| AI         | OpenAI-compatible API, configurable per host        |
| Markdown   | `react-markdown` + `remark-gfm`                    |
| Icons      | `lucide-react`                                      |
| Validation | `zod`                                               |
| Testing    | `vitest`                                            |

## Quick Commands

Requires **Node.js >= 20** and **pnpm >= 10** (`corepack enable pnpm`).

```bash
pnpm dev        # Dev server (http://localhost:3000)
pnpm build      # Production build
pnpm start      # Start production server
pnpm lint       # ESLint
pnpm test       # Run tests (vitest run)
pnpm db:push    # Push schema to PostgreSQL
pnpm db:studio  # Drizzle Studio GUI
pnpm db:seed    # Seed database (creates admin / admin123)
pnpm db:doctor  # Environment & DB diagnostics
```

## Project Structure

```
src/
├── app/
│   ├── actions/               # 17 Server Actions ("use server")
│   ├── admin/                 # Admin panel (ai/, config/, usage/, users/)
│   ├── api/rooms/[id]/events/ # SSE endpoint — GET /api/rooms/[id]/events
│   ├── login/
│   └── rooms/[id]/
├── components/                # 35+ React client components ("use client")
├── db/                        # Drizzle client, 16-table schema, seed
├── lib/                       # 15 utility/service modules
├── i18n/                      # next-intl server config (default: zh)
├── themes/                    # 4 themes; each has themes/<name>/theme.css
├── types/                     # next-auth.d.ts type augmentation
├── auth.ts / auth.config.ts   # NextAuth full config + callbacks
└── proxy.ts                   # Auth middleware

messages/{zh,en}.json          # i18n translation files
db.config.json                 # DB connection config (auto-generated)
```

## Architecture

For deep dives into specific systems, see `docs/`:

| Topic | File |
| ----- | ---- |
| Database — 16 tables, schema, relations | `docs/arch/database.md` |
| Real-time — SSE, privacy filter, DMs | `docs/arch/realtime.md` |
| AI — agent tools, token usage, points, SSRF | `docs/arch/ai-system.md` |
| Character — COC 7th, sheets, skills | `docs/arch/character-system.md` |
| Admin — users, config, stats, filtering | `docs/arch/admin-panel.md` |

### ⚠️ Critical: EventEmitter must use globalThis

Next.js production runs multiple workers. The EventEmitter singleton **must** be persisted to `globalThis` unconditionally — never gate on `NODE_ENV`:

```ts
// ✅ Always
const eventHub = globalThis.__eventHub || new EventEmitter();
globalThis.__eventHub = eventHub;

// ❌ Never — production workers won't share the hub
if (process.env.NODE_ENV !== "production") {
  globalThis.__eventHub = eventHub;
}
```

### Theming

4 themes: `default`, `parchment`, `cthulhu`, `shrine`. Each has `src/themes/<name>/theme.css`. Always use semantic Tailwind classes (`bg-surface`, `text-text`, `border-border`) — never hardcode colors. Variables mapped via `@theme inline` in `globals.css`.

### Chat Commands

Prefix `.` or `。` (Chinese full-stop accepted):

- `.st <skill> <value>` — set skill (batch: `.st 侦查50聆听60`)
- `.rc <skill>` — d100 roll check vs skill value
- `.sc <s>/<f>` — sanity check (COC 7th)
- `.rd<N>` / `.r<N>` — dice roll (supports expressions like `3d100k2+2d20`)
- `.help` — show help

Engine: `src/lib/commands.ts`

### Authentication

- NextAuth v5 beta, Credentials provider (username + bcrypt). Config split: `auth.config.ts` (callbacks) + `auth.ts` (full config with DB).
- `proxy.ts` protects all routes except `/api`, `/login`, `/_next/*`, `/favicon.ico`.
- Admin requires `role === 'admin'`. Session carries: `id`, `name`, `username`, `role`.

## Coding Conventions

- **Path alias**: `@/*` → `src/*`
- **Server Actions**: `src/app/actions/`, `"use server"` directive
- **Client components**: `src/components/`, `"use client"` directive
- **Styling**: Semantic Tailwind tokens only — never arbitrary colors
- **Database**: Drizzle query builder; `db.config.json` holds `{ "type": "postgresql", "url": "..." }`
- **Error handling**: Server actions return result objects, never throw
- **Validation**: Use `zod` at action boundaries
- **Types**: Co-locate in `src/db/schema.ts` and `src/themes/types.ts`

## License

AGPL-3.0 with dual licensing — commercial closed-source use requires a separate license from the author. Attribution to `Joycai` and the original repo is required in all derivative works.

## Environment Variables

| Variable          | Required | Description                                                              |
| ----------------- | -------- | ------------------------------------------------------------------------ |
| `AUTH_SECRET`     | Yes      | NextAuth JWT signing secret                                              |
| `AI_ENCRYPTION_KEY` | Prod   | AES-256-GCM key for AI API keys (dev falls back to `dev-secret-key`)    |
