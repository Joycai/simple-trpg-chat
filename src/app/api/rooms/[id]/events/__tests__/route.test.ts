import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import * as eventsModule from "@/lib/events";

const { subscribeToRoom } = eventsModule;

let mockSession: { user: { id: string; name: string; role: string } } | null = {
  user: {
    id: "1",
    name: "Test User",
    role: "player",
  },
};

vi.mock("@/auth", () => {
  return {
    auth: vi.fn(() => Promise.resolve(mockSession)),
  };
});

vi.mock("@/lib/auth-helpers", () => {
  return {
    checkRoomAccess: vi.fn((roomId: number, requireHost?: boolean) => {
      if (!mockSession) return Promise.reject(new Error("Not authenticated"));
      return Promise.resolve({
        userId: parseInt(mockSession.user.id),
        isHost: mockSession.user.role === "host",
        isAdmin: mockSession.user.role === "admin",
      });
    }),
  };
});

vi.mock("@/lib/events", () => {
  const listeners: Record<number, Array<(data: unknown) => void>> = {};
  const subscribeToRoom = vi.fn((roomId: number, listener: (data: unknown) => void) => {
    if (!listeners[roomId]) listeners[roomId] = [];
    listeners[roomId].push(listener);
    return () => {
      listeners[roomId] = listeners[roomId].filter((l) => l !== listener);
    };
  });
  const subscribeToUser = vi.fn((_roomId: number, _userId: number, _listener: (data: unknown) => void) => {
    return () => {};
  });
  return {
    subscribeToRoom,
    subscribeToUser,
    _listeners: listeners,
  };
});

describe("SSE API Endpoint", () => {
  beforeEach(() => {
    const listeners = (eventsModule as unknown as { _listeners: Record<number, unknown[]> })._listeners;
    for (const key in listeners) {
      delete listeners[key];
    }
    (subscribeToRoom as ReturnType<typeof vi.fn>).mockClear();

    mockSession = {
      user: {
        id: "1",
        name: "Test User",
        role: "player",
      },
    };
    // Clean up the global connection Map between tests
    if (globalThis.__userConnections) {
      globalThis.__userConnections.clear();
    }
  });

  it("should return 401 if unauthorized", async () => {
    mockSession = null;
    const req = new Request("http://localhost/api/rooms/1/events");
    const response = await GET(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
  });

  it("should return 400 for invalid room ID", async () => {
    const req = new Request("http://localhost/api/rooms/invalid/events");
    const response = await GET(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ id: "invalid" }) });
    expect(response.status).toBe(400);
  });

  it("should return 200 with event-stream headers on success", async () => {
    const req = new Request("http://localhost/api/rooms/1/events");
    const response = await GET(req as unknown as import("next/server").NextRequest, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("should limit connections to maximum of 3 per user and return 429", async () => {
    const params = Promise.resolve({ id: "1" });

    // Connection 1, 2, 3 should succeed
    const res1 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    const res2 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    const res3 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    // Connection 4 should fail with 429
    const res4 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    expect(res4.status).toBe(429);
  });

  it("should decrement connection count when request is aborted", async () => {
    const params = Promise.resolve({ id: "1" });
    const abortController = new AbortController();
    const req = new Request("http://localhost", { signal: abortController.signal });

    // Establish connection 1, 2, 3 (with 3rd abortable)
    await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    await GET(req as unknown as import("next/server").NextRequest, { params });

    // Connection 4 fails
    const res4 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    expect(res4.status).toBe(429);

    // Abort connection 3
    abortController.abort();

    // Connection 4 should now succeed
    const res5 = await GET(new Request("http://localhost") as unknown as import("next/server").NextRequest, { params });
    expect(res5.status).toBe(200);
  });

  it("should correctly stream and filter events based on privacy", async () => {
    const params = Promise.resolve({ id: "1" });
    const req = new Request("http://localhost");
    const response = await GET(req as unknown as import("next/server").NextRequest, { params });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    expect(subscribeToRoom).toHaveBeenCalledWith(1, expect.any(Function));
    const listener = (subscribeToRoom as ReturnType<typeof vi.fn>).mock.calls[0][1] as (data: unknown) => void;

    // Read the first chunk (heartbeat)
    const firstChunk = await reader.read();
    expect(decoder.decode(firstChunk.value)).toBe(": heartbeat\n\n");

    // 1. Send public message: should be received
    const publicMsg = { id: 101, audience: "everyone", content: "Hello All" };
    listener(publicMsg);
    const secondChunk = await reader.read();
    expect(decoder.decode(secondChunk.value)).toBe(`data: ${JSON.stringify(publicMsg)}\n\n`);

    // 2. DM between two other users: filtered out (viewer is user 1).
    const privateMsgToOther = { id: 102, audience: "dm", targetUserId: 99, userId: 2, content: "Secret" };
    listener(privateMsgToOther);

    // 3. DM directed to this user (userId 1): should be received.
    const privateMsgToMe = { id: 103, audience: "dm", targetUserId: 1, userId: 2, content: "For your eyes only" };
    listener(privateMsgToMe);
    const thirdChunk = await reader.read();
    expect(decoder.decode(thirdChunk.value)).toBe(`data: ${JSON.stringify(privateMsgToMe)}\n\n`);
  });
});
