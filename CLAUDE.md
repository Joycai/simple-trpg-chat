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
├── db/                        # Drizzle client, 21-table schema, seed
├── lib/                       # 15 utility/service modules
├── i18n/                      # next-intl server config (default: zh)
├── themes/                    # 6 themes; each has themes/<name>/theme.css
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
| Database — 21 tables, schema, relations | `docs/arch/database.md` |
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

6 themes: `default`, `parchment`, `cthulhu`, `shrine`, `rainglass`, `aether`. Each has `src/themes/<name>/theme.css`. Always use semantic Tailwind classes (`bg-surface`, `text-text`, `border-border`) — never hardcode colors. Variables mapped via `@theme inline` in `globals.css`.

### Chat Commands

Prefix `.` or `。` (Chinese full-stop accepted):

- `.st <skill> <value>` — set skill (batch: `.st 侦查50聆听60`)
- `.rc <skill>` — roll check, syntax owned by the room's rule module (COC:
  `.rc b2 侦查` bonus dice / `.rc p 侦查` penalty dice — extra tens dice
  replace the tens digit, keep lowest/highest; `.rc 侦查+1`/`-1` is the suffix
  alias; d20: `.rc 运动+5 15`, advantage `.rc 优势 运动+5 15` / 劣势 rolls
  2d20 keep highest/lowest (nameless: `.r 优势+2 15`); 狩魂者:
  `.rc 侦查+2-1 12`)
- `.rd100b[n]` / `.rd100p[n]` — COC plain bonus/penalty roll, no judgment
  (`.rh100b2` = hidden); the chat card shows each die face, the original
  d100, and the replaced result
- `.rch` / `.rah` — hidden check (same as `.rc`/`.ra`, result visible only to
  the roller — the check-flow counterpart of `.rh`)
- `.sc <s>/<f>` — sanity check (COC 7th)
- `.rd<N>` / `.r<N>` — dice roll (supports expressions like `3d100k2+2d20`)
- `.help` — show help

Engine: `src/lib/commands.ts`

### Quick-Check Panel (快速检定面板)

The ◎ button left of the chat input (Alt+Q) opens a rule-aware panel where a
player picks one of their own stats (stored skills / sheet attributes / 理智)
and rolls the room rule's check without typing. **This is rule-template
territory**: what the panel renders comes from `capabilities.quickCheckPanel`
(pure data — COC gets a bonus/penalty-die toggle, d20 gets modifier + DC
fields, 狩魂者 gets 加骰/时髦骰 steppers, triangle declares nothing and shows
no button), and the command it sends is produced by the rule's
`buildCheckCommand` — so it always equals a hand-typed `.rc`-family command
and the server stays the single resolver. **When adding or changing a
ruleset, this panel spec must be part of the change** — see the
`simple-trpg-chat-rules` skill (§3 `quickCheckPanel`) for the contract.
Component: `src/components/room/chat/QuickCheckPanel.tsx`.

### Avatar System

Users can upload and crop custom avatars for each room they join. Avatars are stored as base64 JPEG in the database (max 512×512px per room membership).

**Features:**
- Individual avatars per room (same user has different avatars in different rooms)
- Canvas-based drag-to-crop UI with live preview
- Fallback to colored letter badge if no avatar set
- Avatar displayed in chat messages next to user nickname

**Implementation:**
- Component: `src/components/AvatarCropper.tsx` (client-side upload/crop)
- Action: `src/app/actions/room.ts` → `uploadAvatarAction()`
- Database: `roomMembers.avatar` (text, nullable, base64 JPEG)
- i18n: `messages/{en,zh}.json` → `avatar.*` keys

**Database Migration Required:**
The `avatar` column was added to `roomMembers` table schema. If upgrading, run:
```bash
pnpm db:push  # Interactive mode — answer "No" to ai_token_usages truncate prompt if it appears
```

### Room Backgrounds

Hosts pre-upload up to 12 background images per room (RoomSettings → 背景图 tab) and switch between them live; players get a local intensity slider (TopBar gear menu → personal section, localStorage, 0 = off). Uploads (≤5MB, JPEG/PNG/WebP — GIF rejected) are re-encoded server-side via `sharp` to bounded WebP (2560px / q80) under `cache/room-backgrounds/` (`ROOM_BACKGROUND_DIR`) — a **separate** directory from chat images because backgrounds are host prep material, not disposable cache; admin cleanup only touches them via an explicit opt-in checkbox. The image renders behind a per-theme scrim (`--theme-bg-scrim*` vars in each `theme.css`); `data-room-bg` on `<body>` softens opaque shells (globals.css). Switching broadcasts the existing `room_settings_updated` SSE event. Core: `src/lib/backgrounds.ts`, `src/app/api/rooms/[id]/backgrounds/`, `src/app/actions/background.ts`, `RoomBackground.tsx` (paints), `hooks/useRoomBgIntensity.ts` (intensity store shared with `RoomTopBar`), `RoomBackgroundManager.tsx`. Reverse-proxy note: nginx needs `client_max_body_size 6m`. Design doc: `docs/design/room-background.md`.

### Notebook (记事本)

Per-user-per-room private markdown notes, opened from the TopBar icon right of the backpack. Notes are strictly private (host included) — every query is scoped by `(roomId, userId)`, and there is no SSE for it (the panel fetches on open). Categories are user-editable (rename / recolor / add / delete, max 12) with one of 7 predefined label colors — theme-token keys (`NOTEBOOK_COLORS`), so labels recolor with the theme; 4 localized defaults are lazily seeded on first open, and deleting a category drops its notes into an "uncategorized" bucket (FK `set null`). Notes support markdown (rendered by the shared `MarkdownRenderer`), local relevance-ranked search, and `@标题` links to backpack entries (inventory items/clues/characters). Mentions store the plain title and resolve by longest-title prefix match at render time, so a deleted backpack item silently degrades to plain text. A note can be **sent to other members** (`shareNoteAction`) as an independent copy — the recipient gets a new row in their own scope (uncategorized, `sourceName` = sender snapshot, badged "来自 X"); later edits never sync, and the copy's `@` links re-resolve against the *recipient's* backpack, so anything they don't hold degrades to plain text. Bots are excluded as recipients on the server (`users.isBot` join), not just in the picker; no SSE, so copies surface on the recipient's next open. The note body's typography (section headings, list markers, quote chrome) is a shared structural layer scoped to `.notebook-note-body` in `globals.css` — values read `var(--theme-nb-*, <fallback to --theme-*>)`, so every theme auto-tints and a theme may override any `--theme-nb-*` at its root (see the `simple-trpg-chat-theme` skill). Core: `src/lib/notebook.ts` (pure helpers + tests), `src/app/actions/notebook.ts`, `src/components/room/notebook/`. Tables: `notebook_categories` + `notebook_notes`.

### Invite-Code Registration

Public `/register` page: new users sign up with a host-issued invite code and join as `player`. Hosts generate codes from the user settings panel ("邀请码" tab, host-only); each code is single-use, expires after 48h (lazy sweep refunds quota). Admin controls: per-host quota column + reset in user management, plus a registration on/off toggle and default quota (`invite_registration_enabled` / `invite_default_quota` in `system_config`) in system config. Core logic: `src/lib/invites.ts` + `src/app/actions/invite.ts`. Design doc: `docs/design/invite-registration.md`.

### Authentication

- NextAuth v5 beta, Credentials provider (username + bcrypt). Config split: `auth.config.ts` (callbacks) + `auth.ts` (full config with DB).
- `proxy.ts` protects all routes except `/api`, `/login`, `/register`, `/_next/*`, `/favicon.ico`.
- Admin requires `role === 'admin'`. Session carries: `id`, `name`, `username`, `role`.

## Coding Conventions

- **Path alias**: `@/*` → `src/*`
- **Server Actions**: `src/app/actions/`, `"use server"` directive
- **Client components**: `src/components/`, `"use client"` directive
- **Styling**: Semantic Tailwind tokens only — never arbitrary colors
- **Database**: Drizzle query builder; `db.config.json` holds `{ "type": "postgresql", "url": "..." }`
- **Error handling**: Server actions return result objects — `{ success: true, ... }` /
  `{ success: false, error }`, with `error` already localized via server-side
  `getTranslations`. Never surface a thrown message to the client: Next.js redacts
  server-action errors in production, so `err.message` renders as "An error occurred in
  the Server Components render…". `checkRoomAccess` still throws (it is shared); wrap it
  per-action, as `background.ts`'s `requireRoomHost` does.
  Converted so far: `background` / `invite` / `ai-import` / `event` / `notebook`.
  Still throwing, to be converted: `inventory` / `character` / `clue` / `room` / `theme` /
  `bot` / `ai-providers`. Read actions may still throw — their callers render a retry state.
- **Validation**: Validate at the action boundary — `zod` where a schema fits
  (`background.ts`, `invite.ts`), an explicit hand-written sanitizer where the rules are
  shared with another caller (`sanitizeTimelineDivider` in `lib/messaging/timeline-payload.ts`,
  used by both `room.ts` and `event.ts`). Length caps belong in `src/lib/` next to the
  feature's other constants so the editor and the action agree.
- **Dialogs**: Never `alert` / `confirm` / `prompt` — they ignore the theme and
  block on mobile. Confirmations use `components/shared/ConfirmDialog.tsx`
  (built on `OverlayShell`; always portals, so it centers correctly when opened
  from inside a drawer). Notifications use `components/shared/Notice.tsx` as an
  inline strip — pass `onDismiss` for a close button. Converted so far:
  `notebook` (all paths), `event` (hand-rolled equivalents, predates the
  shared component).
- **Motion**: overlay enter/exit is driven by `motion` springs in
  `src/lib/useOverlayTransition.ts` — attach its `panelRef` / `backdropRef`, and
  call `close()` (never `onClose`) so the exit plays before the parent unmounts.
  Do NOT reintroduce CSS keyframes for overlays: an earlier `linear()`-based
  version silently disabled all overlay animation on the ~13% of browsers
  lacking `linear()`, because a custom property that fails to parse invalidates
  the whole `animation` declaration. The `overlay-drawer` / `overlay-modal`
  classes still belong on the panel — they are now **theme styling hooks only**
  (rainglass frosts them, shrine reshapes their corners), not animation classes.
  Non-overlay motion (sidebar width, `.overlay-pop` dropdowns) stays in CSS.
- **Types**: Co-locate in `src/db/schema.ts` and `src/themes/types.ts`

## License

AGPL-3.0 with dual licensing — commercial closed-source use requires a separate license from the author. Attribution to `Joycai` and the original repo is required in all derivative works.

## Environment Variables

| Variable          | Required | Description                                                              |
| ----------------- | -------- | ------------------------------------------------------------------------ |
| `AUTH_SECRET`     | Yes      | NextAuth JWT signing secret                                              |
| `AI_ENCRYPTION_KEY` | Prod   | AES-256-GCM key for AI API keys (dev falls back to `dev-secret-key`)    |
