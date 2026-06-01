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

      const listener = (data: any) => {
        // --- Privacy Filter V3.14 (Task I6) ---
        if (data.isPrivate) {
          const isSender = data.userId === userId;
          const isTarget = data.targetUserId === userId;
          
          if (!isSender && !isTarget && !isHost) return;
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
