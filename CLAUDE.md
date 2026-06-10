# CLAUDE.md

@AGENTS.md

## Project Overview

**Simple TRPG Chat** — a lightweight, web-based tabletop RPG (TRPG) tool for multi-player chat, dice rolling, skill checks, inventory management, and optional AI-driven bot NPCs. Built for small-group sessions (e.g., Call of Cthulhu, D&D).

## Tech Stack

| Layer        | Technology                                                  |
| ------------ | ----------------------------------------------------------- |
| Framework    | Next.js 16.2.6 (App Router)                                |
| Language     | TypeScript 5                                                |
| React        | React 19                                                    |
| Styling      | Tailwind CSS v4 (with `@tailwindcss/postcss`)               |
| Database     | SQLite via `better-sqlite3` + Drizzle ORM                   |
| Auth         | NextAuth v5 (beta) with Credentials provider                |
| i18n         | `next-intl` v4 (zh/en, default: zh)                        |
| AI           | OpenAI-compatible API (configurable endpoint per host)      |
| Markdown     | `react-markdown` + `remark-gfm`                            |

## Quick Commands

```bash
pnpm dev             # Start dev server (http://localhost:3000)
pnpm build           # Production build
pnpm lint            # ESLint
pnpm db:push         # Push schema to SQLite (drizzle-kit push)
pnpm db:studio       # Open Drizzle Studio GUI
pnpm db:seed         # Seed database (tsx src/db/seed.ts)
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx            # Root layout (NextIntl + AppProvider)
│   ├── page.tsx              # Home / lobby page
│   ├── globals.css           # Theme CSS variables + Tailwind @theme
│   ├── login/                # Login page
│   ├── rooms/[id]/           # Room chat page (dynamic route)
│   ├── admin/                # Admin panel (role-gated)
│   ├── actions/              # Server Actions
│   │   ├── room.ts           # Room CRUD, dice, messages
│   │   ├── ai.ts             # AI config management
│   │   ├── bot.ts            # Bot user CRUD
│   │   ├── inventory.ts      # Inventory item management
│   │   └── message.ts        # Message-related actions
│   └── api/
│       ├── auth/             # NextAuth route handler
│       └── rooms/[id]/       # SSE streaming endpoint for real-time chat
├── components/               # React client components
│   ├── RoomClient.tsx        # Main chat room UI
│   ├── LobbyClient.tsx       # Room list / lobby
│   ├── ChatInput.tsx         # Message input with command support
│   ├── ChatMessage.tsx       # Single message renderer
│   ├── DiceRoller.tsx        # Dice rolling UI
│   ├── SkillPanel.tsx        # Character skill management
│   ├── InventoryPanel.tsx    # Item inventory (host→player distribution)
│   ├── BotManager.tsx        # AI bot configuration panel
│   ├── HostAiSettings.tsx    # Per-host AI endpoint/key settings
│   ├── MarkdownRenderer.tsx  # Markdown rendering component
│   ├── ThemeProvider.tsx      # Theme context provider
│   ├── ThemeSwitcher.tsx     # Theme selection UI
│   └── ...
├── db/
│   ├── index.ts              # Drizzle client (better-sqlite3)
│   ├── schema.ts             # All table definitions + relations
│   └── seed.ts               # Database seeding script
├── lib/
│   ├── ai_agent.ts           # AI bot agent loop (tool-use, summarization)
│   ├── commands.ts           # Chat command engine (.st, .rc, .rd, .help)
│   ├── encryption.ts         # AES-256-GCM encryption for API keys
│   ├── events.ts             # In-process EventEmitter for real-time SSE
│   └── utils.ts              # Dice rolling, time formatting helpers
├── i18n/
│   └── request.ts            # next-intl server config (default: zh)
├── themes/
│   └── types.ts              # Theme IDs and metadata
├── auth.ts                   # NextAuth full config (Credentials provider)
├── auth.config.ts            # Auth callbacks (JWT, session, route guards)
└── proxy.ts                  # Middleware (auth-protected routes)

messages/                     # i18n translation files
├── zh.json
└── en.json

drizzle/                      # Migration SQL files
drizzle.config.ts             # Drizzle Kit configuration
sqlite.db                     # SQLite database file (gitignored in prod)
```

## Architecture & Key Patterns

### Database

- **ORM**: Drizzle ORM with `better-sqlite3` driver. Schema lives in `src/db/schema.ts`.
- **Tables**: `users`, `rooms`, `room_members`, `messages`, `room_skills`, `system_config`, `host_ai_config`, `inventory_items`, `inventory_distributions`.
- **Migrations**: Use `pnpm db:push` for schema sync (push-based, no migration files needed for dev).
- **Path alias**: `@/db` → `src/db`.

### Authentication

- NextAuth v5 beta with Credentials provider (username + bcrypt password).
- Auth config split into `auth.config.ts` (callbacks, no provider deps) and `auth.ts` (full config with DB).
- Middleware in `src/proxy.ts` protects all routes except `/api`, `/login`, `/_next/*`, `/favicon.ico`.
- Admin routes require `role === 'admin'`.
- Session carries `id`, `name`, `username`, `role`.

### Real-time Messaging

- **SSE (Server-Sent Events)** via API route at `/api/rooms/[id]/stream` (or similar).
- In-process `EventEmitter` hub in `src/lib/events.ts` — broadcasts messages per room.
- No external message broker; single-process only.

### Theming

- 4 themes: `default`, `parchment`, `cthulhu`, `shrine`.
- Implemented via CSS custom properties on `[data-theme]` attribute.
- Theme variables mapped to Tailwind utilities via `@theme inline` block in `globals.css`.
- Always use semantic Tailwind classes (e.g., `bg-surface`, `text-text`, `border-border`) — never hardcode colors.

### Chat Commands

- Prefix: `.` (dot commands)
- `.st <skill> <value>` — Set/update skills (batch: `.st 侦查50聆听60`)
- `.rc <skill>` — Roll check (d100 vs skill value)
- `.rd<N>` — Quick dice roll (e.g., `.rd100`, `.rd20`)
- `.help` — Show command help
- Engine: `src/lib/commands.ts`

### AI Bot System

- Bot users have `isBot: true` and JSON config in `botConfigJson`.
- AI agent loop in `src/lib/ai_agent.ts` supports tools: `roll_dice`, `send_message`, `inspect_item`.
- Each host configures their own API endpoint/key via `host_ai_config` table (encrypted with AES-256-GCM).
- Incremental history summarization after every 30 messages.

### Inventory System

- Host creates inventory items (types: `info`, `character`, `item`).
- Items are distributed to players via `inventory_distributions`.
- Players can share items with each other.
- Unread badge support via `viewed` field.

### i18n

- `next-intl` with server-side locale detection.
- Translation files in `messages/{zh,en}.json`.
- Default locale: `zh` (Chinese).

## Coding Conventions

- **Path aliases**: `@/*` maps to `src/*` (configured in `tsconfig.json`).
- **Server Actions**: Place in `src/app/actions/`. Use `"use server"` directive.
- **Components**: Client components in `src/components/`. Use `"use client"` directive.
- **Styling**: Tailwind CSS v4 with theme-aware semantic tokens. Do NOT use arbitrary color values — use the CSS variable-backed utilities defined in `globals.css`.
- **Database queries**: Use Drizzle query builder. Avoid SQLite-specific methods (`.all()`, `.get()`, `.run()`); use standard async patterns instead.
- **Database configuration**: `db.config.json` at project root. Default is SQLite. Set `{ "type": "postgresql", "url": "..." }` for PostgreSQL. Copy from `db.config.example.json`.
- **Error handling**: Server actions return result objects; do not throw from actions.
- **Types**: Enums and types co-located in schema (`src/db/schema.ts`) and theme types (`src/themes/types.ts`).

## Development & QA Standards

> 以下规范来自 2026-06-10 AI Provider Bug 复盘会。目的是避免低级的"代码推测式"修复反复发生。

### 1. 提交前 Checklist（硬性规定）

前端改动必须执行完整流程验证，不接受"代码看起来没问题"的提交：

```bash
# 1. 构建
pnpm build

# 2. 启动开发服务器
pnpm dev

# 3. 手动验证完整交互链路
#    - 浏览器操作涉及的所有 UI 流程
#    - 特别关注按钮/表单/弹窗等交互元素
```

### 2. Debug 标准化流程

当出现 UI Bug 时，按顺序排查：

1. **确认症状**：按钮没渲染？按钮渲染了但点击无响应？请求报错？
2. **确认数据流**：`console.log` 实际数据：前端接收了什么、后端返回了什么
3. **定位到行**：找到守卫条件或渲染条件的具体代码行
4. **修复**：最小改动，只改一个位置
5. **确认修复**：`pnpm dev` → 浏览器实测

**禁止猜测式修复**：不要提交"可能是 X 导致的"代码。必须先看到数据，再定位行，再修。

### 3. Review Checklist

Code Review 必须逐项实测，不能只看代码：

- [ ] Build 通过（`pnpm build`）
- [ ] `pnpm dev` 可正常启动
- [ ] 涉及的 UI 交互实际点一遍：按钮可点击、表单可提交、弹窗显示正确
- [ ] 数据正确：前端收到的数据包含预期字段
- [ ] PR 只修一个问题：改动集中在最小范围

### 4. Database Schema 双表同步

每次修改 `src/db/schema.ts` 必须同步修改 `src/db/schema.pg.ts`：

```bash
# 每次改完 schema.ts 后执行
# 1. 检查 schema.pg.ts 是否有对应变更
# 2. 如果新加了表/列，在 schema.pg.ts 中同步
# 3. 确保 drizzle-kit push 在两种数据库下都能工作
```

Schema 遗漏是反复出现的根因。两个文件的列和表定义必须一致。

### 5. PR 规范

- **一个 PR 只修一个问题**：不要将多个不相关的修复打包到一个 PR 中
- Bug Fix PR 规模不超过 5 个文件改动
- 合并后检查目标分支确认改动未被覆盖（`grep` 关键改动行）

### 6. 三层测试防线（替代浏览器实测）

当无法运行浏览器时，至少执行这三层验证：

**第一层：代码字段扫描（Review 时必做）**
```bash
# 检查前端使用的字段是否在后端确实返回
grep -rn "p\.isOwner" src/components/
grep -rn "isOwner" src/app/actions/
# 两边结果都必须非空！
```

**第二层：Server Action 数据验证**
```bash
# 用 tsx 直接调用 server action 检查返回值
npx tsx -e "
import { getAllProviders } from './src/app/actions/ai-providers';
getAllProviders().then(r => console.log(JSON.stringify(r, null, 2)));
" | grep isOwner  # 检查关键字段是否存在
```

**第三层：Playwright 无头测试（CI 集成）**
```bash
pnpm exec playwright test --headed=false
```

### 7. Bug 报告规范

报告 Bug 时精确描述，避免模糊表述：

| ❌ 模糊描述 | ✅ 精确描述 |
|-----------|-----------|
| "不能编辑" | "编辑按钮不显示" |
| "登录失败" | "admin:admin123 登录后提示'密码错误'" |
| "主题不生效" | "Admin 面板修改站点主题后，刷新页面回到 Cthulhu" |

---

## Environment Variables

| Variable            | Required | Description                                    |
| ------------------- | -------- | ---------------------------------------------- |
| `AUTH_SECRET`       | Yes      | NextAuth secret for JWT signing                |
| `AI_ENCRYPTION_KEY` | Prod     | Key for AES-256-GCM encryption of AI API keys. Falls back to `dev-secret-key` in development. |
