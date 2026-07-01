import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const checkRoomAccessMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  checkRoomAccess: (...args: unknown[]) => checkRoomAccessMock(...args),
}));

vi.mock("fs/promises", () => ({
  default: { readFile: vi.fn(() => Promise.resolve(Buffer.from("fake-image-bytes"))) },
}));

function makeReq() {
  return new NextRequest("http://localhost/api/rooms/1/images/1-123-abc.jpg");
}

describe("GET /api/rooms/[id]/images/[filename]", () => {
  it("serves the file when the filename's embedded room id matches the URL room id", async () => {
    checkRoomAccessMock.mockResolvedValueOnce({ userId: 1, isHost: false, isAdmin: false });
    const res = await GET(makeReq(), { params: Promise.resolve({ id: "1", filename: "1-123-abc.jpg" }) });
    expect(res.status).toBe(200);
  });

  it("404s when the filename belongs to a different room than the URL room id", async () => {
    // Caller is a legit member of room 1, but the filename is stamped with room 2 —
    // must not be servable through room 1's URL.
    checkRoomAccessMock.mockResolvedValueOnce({ userId: 1, isHost: false, isAdmin: false });
    const res = await GET(makeReq(), { params: Promise.resolve({ id: "1", filename: "2-123-abc.jpg" }) });
    expect(res.status).toBe(404);
  });

  it("rejects when the caller isn't a member of the room", async () => {
    checkRoomAccessMock.mockRejectedValueOnce(new Error("Forbidden"));
    const res = await GET(makeReq(), { params: Promise.resolve({ id: "1", filename: "1-123-abc.jpg" }) });
    expect(res.status).toBe(403);
  });
});
