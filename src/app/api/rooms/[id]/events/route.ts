export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { subscribeToRoom, subscribeToUser } from "@/lib/events";
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

// Next.js HMR workaround: persist userConnections on globalThis during development
declare global {
  var __userConnections: Map<number, Set<ActiveConnection>> | undefined;
}

const userConnections = globalThis.__userConnections || new Map<number, Set<ActiveConnection>>();
// Always persist — production needs shared state
globalThis.__userConnections = userConnections;

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

  // Get or initialize active connections set for this user
  let connections = userConnections.get(userId);
  if (!connections) {
    connections = new Set();
    userConnections.set(userId, connections);
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

  // SSE Connection limit per user (R5)
  if (connections.size >= 3) {
    return new Response("Too many SSE connections (maximum 3)", { status: 429 });
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

        const payload = `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controller closed, ignore
        }
      };

      const unsubscribe = subscribeToRoom(roomId, listener);

      // User-targeted events (typing indicators, etc.) — no privacy filter needed
      const userListener = (data: unknown) => {
        const ev2 = data as RoomEvent;
        if (ev2.id) {
          const idStr = String(ev2.id);
          if (sentIds.has(idStr)) return;
          sentIds.add(idStr);
        }
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        try { controller.enqueue(encoder.encode(payload)); } catch { /* */ }
      };
      const userUnsubscribe = subscribeToUser(roomId, userId, userListener);

      // Send initial heartbeat
      controller.enqueue(encoder.encode(": heartbeat\n\n"));

      // Keep-alive: send heartbeat every 15s to prevent proxy/browser timeout
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        userUnsubscribe();

        // Decrement connection count
        const conns = userConnections.get(userId);
        if (conns) {
          conns.delete(connRecord);
          if (conns.size === 0) {
            userConnections.delete(userId);
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
