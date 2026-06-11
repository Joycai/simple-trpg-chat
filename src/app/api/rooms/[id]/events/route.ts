export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { subscribeToRoom } from "@/lib/events";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { updatePeakOnline } from "@/lib/stats";

interface ActiveConnection {
  controller: ReadableStreamDefaultController;
  cleanup: () => void;
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
  } catch (err: any) {
    return new Response(err.message || "Forbidden", { status: 403 });
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
    } catch (err) {
      // If enqueue throws, the stream controller is closed/errored; prune it
      conn.cleanup();
    }
  }

  // SSE Connection limit per user (R5)
  if (connections.size >= 3) {
    return new Response("Too many SSE connections (maximum 3)", { status: 429 });
  }

  const connRecord: ActiveConnection = {
    controller: null as any,
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

      const listener = (data: any) => {
        // --- Privacy Filter V3.15 (Targeted notification fix) ---
        if (data.isPrivate) {
          if (data.targetUserId) {
            // If it's a targeted private message, show it to the intended recipient and the sender.
            // This prevents KP from seeing "You received..." messages sent to players.
            if (userId !== data.targetUserId && userId !== data.userId) return;
          } else {
            // Generic private message (no target): sender + host see it
            const isSender = data.userId === userId;
            if (!isSender && !isHost) return;
          }
        }

        // Dedup: skip if this message was already sent on this stream
        if (data.id) {
          const idStr = String(data.id);
          if (sentIds.has(idStr)) return;
          sentIds.add(idStr);
        }

        const payload = `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // controller closed, ignore
        }
      };

      const unsubscribe = subscribeToRoom(roomId, listener);

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
