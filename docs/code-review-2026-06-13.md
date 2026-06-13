# Code Review Report — Simple TRPG Chat

**Date:** 2026-06-13  
**Scope:** Bugs · Performance · Security  
**Reviewer:** Claude Code (automated static review)

---

## Summary

| Severity | Security | Bug | Performance | Total |
|----------|----------|-----|-------------|-------|
| Critical | 2 | 1 | — | 3 |
| High | 6 | 4 | 4 | 14 |
| Medium | 7 | 7 | 4 | 18 |
| Low | 1 | 2 | 3 | 6 |
| **Total** | **16** | **14** | **11** | **41** |

---

## Security Findings

### [SEC-01] Critical — Host visibility filter leaks all player private messages

**File:** `src/app/actions/room.ts:370-396`  
**Also:** `src/app/actions/room.ts:542-575` (loadMoreMessages), `src/app/rooms/[id]/page.tsx:81`

The host's visibility condition contains `not(type='system')` as one arm of an `or`. Because any non-system message satisfies this arm, all private player-to-player whispers are returned to the host, bypassing the privacy model entirely.

**Fix:** The host filter should be: show a message if `!isPrivate`, OR if `isPrivate && (targetUserId IS NULL || targetUserId = hostId || userId = hostId)`. Remove the `not(type='system')` arm from the host clause.

---

### [SEC-02] Critical — No enum validation for `theme`, `diceRules`, `ruleTemplate`

**File:** `src/app/actions/room.ts:28-30`, `349-351`

`createRoomAction` and `updateRoomSettingsAction` cast user-supplied strings directly to typed enums (`as Theme`, `as DiceRules`, `as RuleTemplate`) without validating membership. Arbitrary strings can be stored, corrupting data and potentially bypassing business logic.

**Fix:** Validate against the allowed constant arrays (`THEMES`, `DICE_RULES`, `RULE_TEMPLATES`) before inserting; return an error if the value is invalid.

---

### [SEC-03] High — SSRF via unvalidated AI endpoint URLs

**File:** `src/app/actions/ai.ts:44-58`, `src/lib/ai_agent.ts:443-448`, `src/app/actions/ai-import.ts:67-82`

Endpoint URLs from the database are used in outbound HTTP requests without validation. A malicious host can set `http://169.254.169.254/latest/meta-data/` (AWS metadata) or `http://localhost:5432/` to probe internal services.

**Fix:** At save time in `createProvider`/`updateProvider`, validate the URL: require `https://`, reject RFC-1918 address ranges, and optionally maintain an allowlist of trusted domains.

---

### [SEC-04] High — `AI_ENCRYPTION_SALT` falls back to hardcoded value

**File:** `src/lib/encryption.ts:57-59`

`AI_ENCRYPTION_SALT` silently falls back to the string `"salt"` when the environment variable is unset. This weakens AES-256-GCM key derivation for all stored API keys in deployments that omit the variable.

**Fix:** In production (`NODE_ENV === 'production'`), throw an error if `AI_ENCRYPTION_SALT` is not set. Document it as required alongside `AI_ENCRYPTION_KEY`.

---

### [SEC-05] High — `getBotPresetsAction` has no authentication

**File:** `src/app/actions/bot-presets.ts:9-11`

The action reads all bot presets (including system prompts) from the database without any authentication or authorization check.

**Fix:** Add a role check (`requireAdmin()` or at minimum require the caller to be authenticated) at the top of the function.

---

### [SEC-06] High — Admin user list returns full rows including `passwordHash`

**File:** `src/app/admin/users/page.tsx:8`

`db.select().from(users)` with no column projection returns every column, including `passwordHash` and `sessionToken`. These rows are passed to a client component. If the SSR payload is intercepted or the component renders them, password hashes are exposed.

**Fix:** Explicitly select only the columns needed by the UI (`id`, `username`, `displayName`, `role`, `isBanned`, `aiPoints`, etc.), excluding `passwordHash`, `sessionToken`, and `botConfigJson`.

---

### [SEC-07] High — Any room member can read any other member's character data

**File:** `src/app/actions/character.ts:221-235`

`getCharacterDataAction(roomId, targetUserId?)` verifies the caller is a member of the room, then returns character data for any `targetUserId` without checking that `targetUserId` is a member of the same `roomId`.

**Fix:** Before returning data for `targetUserId`, verify they have an active `roomMembers` record for the same `roomId`.

---

### [SEC-08] High — In-memory rate limiter grows without bound; not multi-process safe

**File:** `src/lib/rate-limit.ts:1-24`

The `loginLimitMap` is a plain `Map` that only expires entries on subsequent access. Stale entries accumulate indefinitely. In multi-process deployments the limit is not shared across workers.

**Fix:** Add a periodic cleanup timer or switch to an LRU-with-TTL structure. Document the single-process limitation.

---

### [SEC-09] Medium — `deleteBotAction` lacks room membership cross-check

**File:** `src/app/actions/bot.ts:131-138`

The action verifies the caller is host of `roomId`, then deletes `users` where `id = botUserId` without confirming the bot belongs to that room. A host can delete bots from other rooms if they know the bot's user ID.

**Fix:** Before deleting, verify `isBot = true` and that a `roomMembers` record links `botUserId` to `roomId`.

---

### [SEC-10] Medium — `updateBotAction` lacks room membership cross-check

**File:** `src/app/actions/bot.ts:98-125`

Same pattern as SEC-09: the bot's room membership is not verified before updating its `displayName` and `botConfigJson`.

**Fix:** Add a `roomMembers` join check before the update.

---

### [SEC-11] Medium — XSS via `javascript:` links in Markdown renderer

**File:** `src/components/MarkdownRenderer.tsx:164-170`

Link `href` values are rendered without sanitizing the URL scheme. A user can send `[click me](javascript:alert(1))` and produce a clickable script-execution link.

**Fix:** Reject `href` values that do not start with `https://`, `http://`, or `mailto:`. Alternatively, use `DOMPurify` or a URL allowlist.

---

### [SEC-12] Medium — `testAiConnection` has no authentication

**File:** `src/app/actions/ai.ts:44-68`

The server action makes an outbound HTTP request without verifying the caller's role. Any authenticated user (even a regular player) can call it directly.

**Fix:** Add a role check (`requireHost` or `requireAdmin`) at the top of the function.

---

### [SEC-13] Medium — `updateRoomMemberColorAction` allows cross-room bot color change

**File:** `src/app/actions/room.ts:144-178`

The action checks the caller is host of `roomId` and that `targetUser.isBot` is true, but does not confirm the target bot is a member of `roomId`. A host can change the color of any bot from any other room.

**Fix:** Add a `roomMembers` check for `(roomId, targetBotUserId)` before permitting the update.

---

### [SEC-14] Medium — 30-second ban propagation delay (session cache not invalidated on ban)

**File:** `src/auth.config.ts:4-26`

`sessionCache` caches session validity for 30 seconds. When a user is banned, existing sessions remain valid for up to 30 seconds because the cache is not cleared.

**Fix:** Call `sessionCache.delete(userId)` inside `toggleBanUser` immediately after the database update.

---

### [SEC-15] Low — Client-side room key generator uses `Math.random()`

**File:** `src/components/LobbyClient.tsx:36-43`

`Math.random()` is not cryptographically secure. Keys generated through the UI helper are predictable.

**Fix:** Use `crypto.getRandomValues()` for client-side key generation, or generate keys exclusively server-side.

---

### [SEC-16] Low — Sensitive words cache is not atomically updated (concurrent race)

**File:** `src/lib/sensitive-words.ts:17-48`

`cachedCustomWords` is a module-level variable. Under high concurrency a request may read the old cache while another refreshes it.

**Fix:** Low priority. Consider using an atomic swap or `Promise` lock, or accept the minor race given the low security impact.

---

## Bug Findings

### [BUG-01] Critical — Concurrent tool execution with `Promise.all` causes DB race conditions

**File:** `src/lib/ai_agent.ts:508-760`

Tool call results for a single LLM turn are dispatched with `Promise.all`. When the LLM returns multiple tool calls that mutate shared state (e.g., multiple `set_character_card` or `send_message` calls), they run concurrently, producing race conditions on DB writes.

**Fix:** Execute tool calls sequentially within a single LLM turn for state-mutating operations, or wrap conflicting writes in transactions.

---

### [BUG-02] High — `agentCooldowns` map never pruned, grows without bound

**File:** `src/lib/ai_agent.ts:129`

The `agentCooldowns` Map stores `botUserId → timestamp` entries that are never removed. In a long-running server the map grows indefinitely; in multi-process deployments the cooldown is not shared.

**Fix:** Prune entries older than the cooldown window on each access (e.g., delete entries where `Date.now() - ts > 3000`), or use an LRU cache with max size.

---

### [BUG-03] High — `loadMoreMessagesAction` has same visibility filter bug as `getRoomMessages`

**File:** `src/app/actions/room.ts:542-575`

The duplicated visibility filter at lines 545-565 contains the same `not(type='system')` arm (see SEC-01), leaking all non-system private messages to the host during pagination.

**Fix:** Apply the same corrected filter described in SEC-01.

---

### [BUG-04] High — `summarizeHistoryAction` fetches all messages with no limit

**File:** `src/lib/ai_agent.ts:795`

`db.select().from(messages).where(gt(messages.id, lastId))` fetches all messages since the last summary with no `LIMIT`. In an active room this can load thousands of rows into memory, risking OOM.

**Fix:** Add a reasonable `LIMIT` (e.g., 500) and summarize in chunks, or use cursor-based pagination.

---

### [BUG-05] High — `revealClueToPlayersAction` performs no room-scoped isolation at boundary

**File:** `src/app/actions/clue.ts:248-258`

The action fetches a clue by `clueId` alone, then checks access on the fetched clue's `roomId`. There is no caller-supplied `roomId` cross-check, making the access boundary depend entirely on the DB state of the clue.

**Fix:** Accept and validate a caller-supplied `roomId` parameter and verify `clue.roomId === roomId` before proceeding.

---

### [BUG-06] Medium — Double-path command handling in `RoomClient` is fragile

**File:** `src/components/RoomClient.tsx:502-517`, `src/app/actions/room.ts:220`

Command interception happens in both the client component and the server action. Removing the client-side guard in a future change would cause double-execution.

**Fix:** Document the intentional dual-guard with a comment, or centralize command handling in one layer.

---

### [BUG-07] Medium — `getUnreadDMCountAction` fetches all DMs with no limit

**File:** `src/app/actions/room.ts:494-507`

Fetches every private message targeted at the user in a room with no `LIMIT`. In a long session this performs a full scan and loads many rows into memory on every page load.

**Fix:** Add a date/ID range filter (e.g., messages newer than 30 days), or rewrite as a SQL `COUNT` query (see PERF-07).

---

### [BUG-08] Medium — Export includes all private whispers, bypassing privacy model

**File:** `src/app/actions/export.ts:101-111`

The room export includes the full content of all player-to-player private messages, even though hosts are not supposed to see these under the privacy model.

**Fix:** Either exclude private player-to-player messages from the export, or add a visible disclosure that the export includes whispers.

---

### [BUG-09] Medium — Optimistic placeholder IDs can collide at `Date.now()` resolution

**File:** `src/components/RoomClient.tsx:506-514`

Error messages use `id: Date.now()` as a placeholder. Two errors within 1 ms get the same ID; the dedup logic in `seenIdsRef` silently drops the second.

**Fix:** Use `Date.now() + Math.random()` or an incrementing counter for placeholder IDs.

---

### [BUG-10] Medium — `upsertSkillAction` has no room membership check

**File:** `src/app/actions/skills.ts:22-46`

Any authenticated user can upsert skills for themselves in any room, even one they have not joined.

**Fix:** Call `checkRoomAccess(roomId, false)` (or equivalent) before the insert.

---

### [BUG-11] Medium — `getMySkillsAction` has no room membership check

**File:** `src/app/actions/skills.ts:12-19`

Same pattern: any authenticated user can read skills for any room ID.

**Fix:** Add a room membership check.

---

### [BUG-12] Medium — Sanity check allows negative deduction (sanity restoration on fail)

**File:** `src/lib/commands.ts:313-315`

If a dice expression evaluates to a negative value (e.g., `2d6-5` rolling below 5), `deductVal` is negative, making `currentSan - deductVal` larger than `currentSan`. This restores sanity on a failed sanity check, which is a rules violation.

**Fix:** Clamp `deductVal` to a minimum of 0: `const clamped = Math.max(0, deductVal)`.

---

### [BUG-13] Low — `connRecord.cleanup` closure captures stub, not real cleanup

**File:** `src/app/api/rooms/[id]/events/route.ts:73-78`

`connRecord.cleanup` is assigned the initial stub `() => {}` before the real `cleanup` function is defined inside `start()`. If a connection is pruned before `start()` fires, the real heartbeat/unsubscribe logic is never called.

**Fix:** Assign `connRecord.cleanup` inside `start()` after the real `cleanup` is defined, or store `connRecord` and update it there.

---

### [BUG-14] Low — Middleware `authorized` callback returns `true` for unauthenticated users on all non-login routes

**File:** `src/auth.config.ts:35-58`

Unauthenticated requests to room pages pass the middleware check (callback returns `true`). Protection relies on the server component as a last-ditch guard rather than the middleware layer.

**Fix:** Return `false` (or redirect to `/login`) in the `authorized` callback for any unauthenticated request to protected paths. This hardens the middleware as the primary gate.

---

## Performance Findings

### [PERF-01] High — N+1 member lookup on every text message send

**File:** `src/app/actions/room.ts:270-283`

`sendMessageAction` loads all `roomMembers` with `{ with: { user: true } }` on every non-private text message to detect bot mentions. This join runs synchronously in the critical path of message delivery.

**Fix:** Move the bot mention lookup into the async background trigger (it already defers agent execution). The membership query can run inside the imported async function.

---

### [PERF-02] High — Missing index on `messages.targetUserId`

**File:** `src/db/schema.ts:107-121`

No index on `targetUserId`. Queries filtering by this column (DM count, SSE privacy filter, `loadMoreMessages`) perform full scans of the room's message set.

**Fix:** Add `index('idx_messages_target_user_id').on(t.targetUserId)` to the `messages` table definition, then run `pnpm db:push`.

---

### [PERF-03] High — `summarizeHistoryAction` loads all messages into process memory

**File:** `src/lib/ai_agent.ts:795`

All messages since the last summary are fetched into memory with no limit. Same root cause as BUG-04.

**Fix:** Add a `LIMIT` and process in chunks. See BUG-04 for details.

---

### [PERF-04] High — Export accumulates all messages in process memory

**File:** `src/app/actions/export.ts:54-75`

All message chunks are accumulated in an `allMessages` array before processing. For a room with tens of thousands of messages this is a memory spike.

**Fix:** Process each chunk incrementally and stream/write output rather than accumulating all chunks in memory.

---

### [PERF-05] Medium — `characterCache` in `ChatMessage.tsx` grows without bound (browser memory leak)

**File:** `src/components/ChatMessage.tsx:13-18`

The module-level `characterCache` Map is never cleared. In a long session with many senders, the cache accumulates indefinitely in the browser tab.

**Fix:** Use an LRU cache with a max size (e.g., 50 entries), or clear entries when the component tree unmounts.

---

### [PERF-06] Medium — SSE `sentIds` FIFO prune removes only one entry per overflow

**File:** `src/app/api/rooms/[id]/events/route.ts:117-122`

When `sentIds.size > 200`, only one entry is removed. In a burst, the set can grow far beyond 200 before stabilizing.

**Fix:** When the size exceeds the limit, prune enough entries to bring the set back to half capacity (100 entries).

---

### [PERF-07] Medium — `getUnreadDMCountAction` computes unread counts in application layer

**File:** `src/app/actions/room.ts:494-517`

All private messages are fetched into memory; unread counts are computed in JavaScript by comparing timestamps. This should be a SQL `COUNT(*)` query with appropriate `WHERE` conditions.

**Fix:** Rewrite as a SQL aggregation: `SELECT senderId, COUNT(*) FROM messages WHERE roomId=? AND targetUserId=? AND createdAt > ? GROUP BY senderId`.

---

### [PERF-08] Medium — `seenIdsRef` set rebuild fires on every message append

**File:** `src/components/RoomClient.tsx:153-159`

The `useEffect` with `[messages.length]` dependency rebuilds the entire `Set` from `messages.map(...)` on every new message. At 500+ messages this is O(n) work per message received.

**Fix:** Maintain the set incrementally by adding only new message IDs rather than rebuilding from scratch. Use a counter-based pruning strategy (prune every 100 messages) rather than length-based.

---

### [PERF-09] Low — `maskProviderKey` decrypts every API key to show last 4 characters

**File:** `src/app/actions/ai-providers.ts:174-178`

`getMyProviders()` decrypts every provider's API key just to extract the last 4 characters for display.

**Fix:** Store the last 4 characters of the plaintext key in a dedicated `apiKeyHint` column at save time, eliminating the need to decrypt at display time.

---

### [PERF-10] Low — Login cleanup uses two queries instead of one

**File:** `src/lib/login-history.ts:47-64`

Two separate queries (select IDs to delete, then delete them) where one subquery delete would suffice.

**Fix:** Use `DELETE FROM login_history WHERE id NOT IN (SELECT id FROM login_history WHERE userId=? ORDER BY loginAt DESC LIMIT 30)`.

---

### [PERF-11] Low — Typing indicator wakes all subscriber callbacks for private bot replies

**File:** `src/lib/ai_agent.ts:413-421`

Private typing events are broadcast via `broadcastToRoom`, waking all subscriber callbacks even though the SSE filter ultimately suppresses delivery to non-recipients. This is low overhead but architecturally wasteful.

**Fix:** For private typing events, use a targeted emit rather than a room-wide broadcast, or accept the current behavior as a known minor inefficiency.

---

## Appendix: Finding Index

| ID | Category | Severity | Title |
|----|----------|----------|-------|
| SEC-01 | Security | Critical | Host visibility filter leaks all player private messages |
| SEC-02 | Security | Critical | No enum validation for theme/diceRules/ruleTemplate |
| SEC-03 | Security | High | SSRF via unvalidated AI endpoint URLs |
| SEC-04 | Security | High | `AI_ENCRYPTION_SALT` falls back to hardcoded value |
| SEC-05 | Security | High | `getBotPresetsAction` has no authentication |
| SEC-06 | Security | High | Admin user list returns full rows including `passwordHash` |
| SEC-07 | Security | High | Any room member can read any other member's character data |
| SEC-08 | Security | High | In-memory rate limiter grows without bound; not multi-process safe |
| SEC-09 | Security | Medium | `deleteBotAction` lacks room membership cross-check |
| SEC-10 | Security | Medium | `updateBotAction` lacks room membership cross-check |
| SEC-11 | Security | Medium | XSS via `javascript:` links in Markdown renderer |
| SEC-12 | Security | Medium | `testAiConnection` has no authentication |
| SEC-13 | Security | Medium | `updateRoomMemberColorAction` allows cross-room bot color change |
| SEC-14 | Security | Medium | 30-second ban propagation delay (session cache not invalidated on ban) |
| SEC-15 | Security | Low | Client-side room key generator uses `Math.random()` |
| SEC-16 | Security | Low | Sensitive words cache concurrent race on refresh |
| BUG-01 | Bug | Critical | Concurrent tool execution with `Promise.all` causes DB race conditions |
| BUG-02 | Bug | High | `agentCooldowns` map never pruned, grows without bound |
| BUG-03 | Bug | High | `loadMoreMessagesAction` has same visibility filter bug (SEC-01 duplicate) |
| BUG-04 | Bug | High | `summarizeHistoryAction` fetches all messages with no limit |
| BUG-05 | Bug | High | `revealClueToPlayersAction` no room-scoped isolation at boundary |
| BUG-06 | Bug | Medium | Double-path command handling in `RoomClient` is fragile |
| BUG-07 | Bug | Medium | `getUnreadDMCountAction` fetches all DMs with no limit |
| BUG-08 | Bug | Medium | Export includes all private whispers, bypassing privacy model |
| BUG-09 | Bug | Medium | Optimistic placeholder IDs can collide at `Date.now()` resolution |
| BUG-10 | Bug | Medium | `upsertSkillAction` has no room membership check |
| BUG-11 | Bug | Medium | `getMySkillsAction` has no room membership check |
| BUG-12 | Bug | Medium | Sanity check allows negative deduction (sanity restoration on fail) |
| BUG-13 | Bug | Low | `connRecord.cleanup` closure captures stub, not real cleanup |
| BUG-14 | Bug | Low | Middleware `authorized` returns `true` for unauthenticated users on protected routes |
| PERF-01 | Performance | High | N+1 member lookup on every text message send |
| PERF-02 | Performance | High | Missing index on `messages.targetUserId` |
| PERF-03 | Performance | High | `summarizeHistoryAction` loads all messages into process memory |
| PERF-04 | Performance | High | Export accumulates all messages in process memory |
| PERF-05 | Performance | Medium | `characterCache` grows without bound (browser memory leak) |
| PERF-06 | Performance | Medium | SSE `sentIds` FIFO prune removes only one entry per overflow |
| PERF-07 | Performance | Medium | `getUnreadDMCountAction` computes unread counts in app layer |
| PERF-08 | Performance | Medium | `seenIdsRef` set rebuild fires on every message append |
| PERF-09 | Performance | Low | `maskProviderKey` decrypts every key to show last 4 chars |
| PERF-10 | Performance | Low | Login cleanup uses two queries instead of one |
| PERF-11 | Performance | Low | Typing indicator wakes all subscriber callbacks for private replies |
