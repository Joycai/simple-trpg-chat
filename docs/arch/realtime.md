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

## Privacy Filter V3.15

The SSE route filters messages before sending to each client:
- Public messages: broadcast to all room members.
- Private messages (`isPrivate: true` + `targetUserId`): only delivered to the sender and the target recipient.
- Bot messages directed at a specific player are similarly filtered.

## Private Messaging (DM)

- A DM is any message with `isPrivate: true` and a non-null `targetUserId`.
- `roomDmReads` table tracks the last-read timestamp per `(roomId, userId, partnerUserId)` pair.
- `ConversationPanel.tsx` renders public chat + DM tabs with unread indicators derived from `roomDmReads`.

## Message Types

The `messages.type` column distinguishes system events, dice rolls, and chat messages. `diceDetail` carries structured dice result data for roll messages.
