# Real-time & Messaging

## SSE Endpoint

- **Route**: GET `/api/rooms/[id]/events` (`src/app/api/rooms/[id]/events/route.ts`)
- Establishes persistent SSE connection per room.
- Authenticates user, verifies room membership, then streams events.
- Heartbeat every 15s to prevent proxy/browser timeout.
- Max 3 simultaneous SSE connections per user (rate limit R5).
- Dev mode: deduplicates messages per stream to prevent double-sends.

## EventEmitter Hub

In-process hub in `src/lib/events.ts`. No external message broker — single-process only.

**Critical**: The singleton must be persisted to `globalThis` **unconditionally**. Next.js production workers each get their own module scope; without `globalThis`, the subscriber and the publisher hold different instances and messages are silently dropped.

```ts
// ✅ Correct
const eventHub = globalThis.__eventHub || new EventEmitter();
globalThis.__eventHub = eventHub;

// ❌ Wrong — production skips this, workers diverge
if (process.env.NODE_ENV !== "production") {
  globalThis.__eventHub = eventHub;
}
```

## Visibility model — `audience` (central router)

Every message declares a single **`audience`** describing who may see it. All
delivery/visibility decisions derive from this one field — there is no scattered
`isPrivate`/`type` sniffing. The model lives in `src/lib/messaging/`:

- **`audience.ts`** — dependency-free predicates shared by server **and** client:
  `canSee(msg, viewer, isHost)`, `channelOf(msg, viewer)`, `countsAsDmUnread(...)`.
- **`router.ts`** — `dispatchMessage(...)` is the **only** code path that inserts a
  message: senders pass a semantic `audience`, it derives the stored fields, writes
  the row, and broadcasts over SSE. `messageVisibilityWhere(roomId, viewer, isHost)`
  is the single SQL predicate reused by every history query.

| audience    | Who can see it                        | Examples |
| ----------- | ------------------------------------- | -------- |
| `everyone`  | all room members (public feed)        | public chat, open rolls, public checks/clues |
| `self`      | only the actor                        | `.st` / `.help` / `.rh`, sensitive-word warning, KP psychology **result** |
| `recipient` | only the target — **not** the actor   | psychology **notify**, item/clue "you received…" receipts |
| `directed`  | actor + one target (inline in public) | a pushed clue **card** (host + recipient both see it) |
| `dm`        | the two DM participants               | 1:1 whispers, dice/checks issued inside a DM |
| `gm`       | actor + the room host                | host action logs, GM-private rolls |

The SSE route (`route.ts`) calls `canSee` to filter each event; non-message events
(typing, `room_settings_updated`, …) carry no `audience` and are public by
construction.

> **Storage note:** `messages.audience` is the source of truth. The legacy
> `is_private` column is kept only as a derived mirror (`audience !== 'everyone'`)
> written by the router — no visibility logic reads it. `targetUserId` is stored
> only for `dm` and `directed`.

## Private Messaging (DM)

- A DM is a message with `audience === 'dm'`; `channelOf` routes it to the partner's tab.
- `roomDmReads` tracks the last-read timestamp per `(roomId, userId, partnerUserId)` pair.
- DM unread counts (`getUnreadDMCountAction` + the client) use `countsAsDmUnread`, so
  inline notices (`self`/`directed`/`gm`) never inflate a DM badge.
- `ConversationPanel.tsx` renders public chat + DM tabs with unread indicators.

## Message Types

The `messages.type` column (`text` | `dice` | `system` | `clue` | `check_request` |
`image`) classifies content for **rendering** only — it no longer drives visibility,
which is owned entirely by `audience`. `diceDetail` carries structured roll/check data.
