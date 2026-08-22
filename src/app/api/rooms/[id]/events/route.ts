export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { subscribeToRoom, subscribeToUser, broadcastToRoom } from "@/lib/events";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { updatePeakOnline } from "@/lib/stats";
import { canSee, isAudience, type Audience } from "@/lib/messaging/audience";

interface ActiveConnection {
  controller: ReadableStreamDefaultController;
  cleanup: () => void;
}

interface RoomEvent {
  id?: string | number;
  audience?: Audience;
  isPrivate?: boolean;
  targetUserId?: number;
  userId?: number;
  type?: string;
  [key: string]: unknown;
}

// Next.js HMR workaround: persist userConnections on globalThis during development.
// Keyed per (userId, roomId): a global per-user cap silently killed the 4th
// room tab of a multi-room host — after the client's retries all 429'd, that
// room stayed rendered but never updated again.
declare global {
  var __userConnections: Map<string, Set<ActiveConnection>> | undefined;
  var __roomPresence: Map<number, Map<number, number>> | undefined;
}

const userConnections = globalThis.__userConnections || new Map<string, Set<ActiveConnection>>();
globalThis.__userConnections = userConnections;

// One serialization+encode per broadcast, not per connection: the EventEmitter
// hands every listener the SAME object reference, so the encoded SSE frame is
// cached per event object (WeakMap — entries die with the event, no growth).
// A 50-connection room previously stringified the identical payload 50 times.
const frameEncoder = new TextEncoder();
const framedEvents = new WeakMap<object, Uint8Array>();
function sseFrame(data: unknown): Uint8Array {
  if (typeof data !== "object" || data === null) {
    return frameEncoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  }
  let frame = framedEvents.get(data);
  if (!frame) {
    frame = frameEncoder.encode(`data: ${JSON.stringify(data)}\n\n`);
    framedEvents.set(data, frame);
  }
  return frame;
}

// Tracks active SSE connection counts per room per user: roomId → (userId → count).
// Used to broadcast presence_update events when users come online/go offline.
const roomPresence = globalThis.__roomPresence || new Map<number, Map<number, number>>();
globalThis.__roomPresence = roomPresence;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const roomId = parseInt(id);

  if (isNaN(roomId)) {
    return new Response("Invalid room ID", { status: 400 });
  }

  let userId: number;
  let isHost = false;

  try {
    const access = await checkRoomAccess(roomId, false);
    userId = access.userId;
    isHost = access.isHost;
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.message : "Forbidden", { status: 403 });
  }

  // Get or initialize active connections set for this user in this room
  const connKey = `${userId}:${roomId}`;
  let connections = userConnections.get(connKey);
  if (!connections) {
    connections = new Set();
    userConnections.set(connKey, connections);
  }

  // Active validation: ping all existing connections to prune any dead/closed ones
  const pingEncoder = new TextEncoder();
  for (const conn of Array.from(connections)) {
    try {
      // Send a protocol-compliant keep-alive comment payload
      conn.controller.enqueue(pingEncoder.encode(":\n\n"));
    } catch {
      // If enqueue throws, the stream controller is closed/errored; prune it
      conn.cleanup();
    }
  }

  // SSE Connection limit per user per room (R5)
  if (connections.size >= 3) {
    return new Response("Too many SSE connections for this room (maximum 3)", { status: 429 });
  }

  const connRecord: ActiveConnection = {
    controller: null as unknown as ReadableStreamDefaultController,
    cleanup: () => {}
  };

  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      connRecord.controller = controller;
      connRecord.cleanup = cleanup;
      connections!.add(connRecord);
      updatePeakOnline().catch((err) => {
        console.error("[STATS] Error updating peak online on connect:", err);
      });

      const encoder = new TextEncoder();
      // Per-stream dedup: prevent sending the same message twice (protects against EventEmitter listener accumulation in dev mode)
      const sentIds = new Set<string>();

      const listener = (data: unknown) => {
        const ev = data as RoomEvent;
        // --- Visibility filter: one rule, driven by the message audience ---
        // Persisted messages (and audience-tagged events like check_update) carry
        // an `audience`; non-message room events (typing, settings_updated, …) do
        // not and are public by construction.
        if (isAudience(ev.audience)) {
          if (!canSee({ userId: ev.userId ?? -1, targetUserId: ev.targetUserId ?? null, audience: ev.audience }, userId, isHost)) {
            return;
          }
        }

        // Dedup: skip if this message was already sent on this stream
        if (ev.id) {
          const idStr = String(ev.id);
          if (sentIds.has(idStr)) return;
          sentIds.add(idStr);
          // Bulk-prune to keep set bounded (drop oldest 50 when over limit)
          if (sentIds.size > 200) {
            const toDelete = Array.from(sentIds).slice(0, 50);
            for (const id of toDelete) sentIds.delete(id);
          }
        }

        try {
          controller.enqueue(sseFrame(data));
        } catch {
          // Controller closed — the very signal this stream is dead. Behind
          // buffering proxies neither req.signal abort nor cancel() may ever
          // fire, so tear down here or the room/user listeners, the conn
          // record, and the presence count all leak (ghost-online members)
          // until the same user happens to reconnect and trip the prune.
          cleanup();
        }
      };

      const unsubscribe = subscribeToRoom(roomId, listener);

      // Presence: register this connection and broadcast updated online list to all room members.
      // Must run after subscribeToRoom so this connection also receives the broadcast.
      {
        let roomConns = roomPresence.get(roomId);
        if (!roomConns) {
          roomConns = new Map<number, number>();
          roomPresence.set(roomId, roomConns);
        }
        roomConns.set(userId, (roomConns.get(userId) || 0) + 1);
        broadcastToRoom(roomId, { type: "presence_update", onlineUserIds: Array.from(roomConns.keys()) });
      }

      // User-targeted events (typing indicators, etc.) — no privacy filter needed
      const userListener = (data: unknown) => {
        const ev2 = data as RoomEvent;
        if (ev2.id) {
          const idStr = String(ev2.id);
          if (sentIds.has(idStr)) return;
          sentIds.add(idStr);
        }
        // Same dead-stream teardown as the room listener above.
        try { controller.enqueue(sseFrame(data)); } catch { cleanup(); }
      };
      const userUnsubscribe = subscribeToUser(roomId, userId, userListener);

      // Send initial heartbeat
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      // Keep-alive: send heartbeat every 15s to prevent proxy/browser timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Dead stream — full teardown, not just the interval (see the room
          // listener's catch). cleanup() clears this interval itself.
          cleanup();
        }
      }, 15000);

      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        userUnsubscribe();

        // Presence: decrement connection count; broadcast offline only when user has no connections left.
        const roomConns = roomPresence.get(roomId);
        if (roomConns) {
          const count = roomConns.get(userId) || 0;
          if (count <= 1) {
            roomConns.delete(userId);
            if (roomConns.size === 0) roomPresence.delete(roomId);
            broadcastToRoom(roomId, { type: "presence_update", onlineUserIds: Array.from(roomConns.keys()) });
          } else {
            roomConns.set(userId, count - 1);
          }
        }

        // Decrement connection count
        const conns = userConnections.get(connKey);
        if (conns) {
          conns.delete(connRecord);
          if (conns.size === 0) {
            userConnections.delete(connKey);
          }
        }
        updatePeakOnline().catch((err) => {
          console.error("[STATS] Error updating peak online on disconnect:", err);
        });
      };
      // Assign real cleanup to connRecord now that it's fully defined
      connRecord.cleanup = cleanup;

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
