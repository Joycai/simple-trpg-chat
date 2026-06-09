# Known Pitfalls & Troubleshooting

## Integration & Rendering

### 1. Component not rendered (recurring!)
New panels (SkillPanel, ClueManager, ConversationPanel, AiImportPanel) were repeatedly created with import + state but **missing JSX render**. Always verify `<NewPanel />` exists in both the import AND the return block of RoomClient. Two people adding the same component = duplicate buttons.

### 2. Drizzle innerJoin data shape
`.select().from(A).innerJoin(B, ...)` returns `{ a: {...}, b: {...} }`, NOT flat fields. Access `p.room_members?.nickname` not `p.nickname`, or fallback `p.users?.displayName`. Otherwise displays show "?".

## Real-time & SSE

### 3. Duplicate messages
Caused by: (a) optimistic update with `Date.now()` temp ID + SSE broadcast with real DB ID, or (b) HMR listener accumulation in dev mode.
Fix: per-stream `sentIds` Set on server (`route.ts`) + `seenIdsRef` Set on client (`RoomClient.tsx`) for absolute dedup.

### 4. SSE privacy filter V3.15
Targeted messages (`targetUserId` set) → sender + target only (host NOT auto-included). Generic private messages (`targetUserId` null) → sender + host. 
Common bugs: "KP sees player's 'received item' notification" or "sender can't see own message in DM tab".

## Database & Schema

### 5. Schema changes need db:push + restart
Adding columns (like `viewed`, `ruleTemplate`) compiles fine but SQLite rejects at runtime with `no such column`. Always run `pnpm db:push` and restart `pnpm dev` after schema.ts changes.

### 6. instrumentation.ts required
`initDb()` must be called on server startup via `src/instrumentation.ts` → `register()`. Without it, PostgreSQL switching never activates. The register function must check `NEXT_RUNTIME === 'nodejs'` to avoid Edge errors.

## Runtime & Environment

### 7. Edge Runtime vs Node.js modules
`proxy.ts` (middleware) runs in Edge by default — cannot import `better-sqlite3`, `fs`, or any native module. Use `auth.config.ts` for lightweight config, keep DB imports in Server Components/Actions only.

### 8. pnpm native modules
After `pnpm install`, `better-sqlite3` may need `pnpm rebuild better-sqlite3` for binary bindings. Linux requires GCC 11+ (C++20 support). CI runs `pnpm install --frozen-lockfile`.

### 9. package-lock.json removed
Only `pnpm-lock.yaml` is used. `npm ci` will fail — use `pnpm install --frozen-lockfile` in CI.

### 10. AUTH_SECRET missing
`.env` file required with `AUTH_SECRET=<random>`. Running from wrong directory (e.g., github-mirror) causes `MissingSecret` errors. Run `bash setup.sh` for first-time setup.
