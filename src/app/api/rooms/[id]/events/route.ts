import { subscribeToRoom } from "@/lib/events";
import { NextRequest } from "next/server";
import { auth } from "@/auth";

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

  const userId = parseInt((session.user as any).id);
  const isHost = (session.user as any).role === "host";

  const stream = new ReadableStream({
    start(controller) {
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

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
