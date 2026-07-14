import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { GET as GET_FILE } from "../[filename]/route";

const checkRoomAccessMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  checkRoomAccess: (...args: unknown[]) => checkRoomAccessMock(...args),
}));

// Drizzle chain stubs: count query + insert().values().returning().
const countResultMock = vi.fn(() => [{ value: 0 }]);
const insertReturningMock = vi.fn(() =>
  Promise.resolve([{ id: 1, title: null, sizeBytes: 1234 }])
);
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(countResultMock()),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: () => insertReturningMock() }),
    }),
  },
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn(() => Promise.resolve()),
    writeFile: vi.fn(() => Promise.resolve()),
    unlink: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve(Buffer.from("fake-webp-bytes"))),
  },
}));

// Stub the sharp pipeline — the real module lazy-imports the native binary,
// which tests must never load. Everything else from the module stays real.
vi.mock("@/lib/backgrounds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backgrounds")>();
  return {
    ...actual,
    compressBackgroundToWebp: vi.fn((input: Buffer) => {
      if (input.toString().startsWith("not-an-image")) {
        return Promise.reject(new Error("unsupported image format"));
      }
      return Promise.resolve(Buffer.from("compressed-webp"));
    }),
    ensureRoomBackgroundDir: vi.fn(() => Promise.resolve("/tmp/room-backgrounds")),
  };
});

function makeUploadReq(opts: { bytes?: number; mime?: string; content?: string } = {}) {
  const { bytes = 1024, mime = "image/jpeg", content } = opts;
  const body = content ?? "x".repeat(bytes);
  const form = new FormData();
  form.set("file", new File([body], "upload.bin", { type: mime }));
  return new NextRequest("http://localhost/api/rooms/1/backgrounds", {
    method: "POST",
    body: form,
  });
}

const params = { params: Promise.resolve({ id: "1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  countResultMock.mockReturnValue([{ value: 0 }]);
  checkRoomAccessMock.mockResolvedValue({ userId: 1, isHost: true, isAdmin: false });
});

describe("POST /api/rooms/[id]/backgrounds", () => {
  it("requires host access (players get 403)", async () => {
    checkRoomAccessMock.mockRejectedValueOnce(
      new Error("Unauthorized: Host access required for this room")
    );
    const res = await POST(makeUploadReq(), params);
    expect(res.status).toBe(403);
    // The host requirement must be requested from checkRoomAccess itself.
    expect(checkRoomAccessMock).toHaveBeenCalledWith(1, true);
  });

  it("rejects GIF with 415", async () => {
    const res = await POST(makeUploadReq({ mime: "image/gif" }), params);
    expect(res.status).toBe(415);
  });

  it("rejects uploads over 5MB with 413", async () => {
    const res = await POST(makeUploadReq({ bytes: 5 * 1024 * 1024 + 1 }), params);
    expect(res.status).toBe(413);
  });

  it("accepts exactly 5MB", async () => {
    const res = await POST(makeUploadReq({ bytes: 5 * 1024 * 1024 }), params);
    expect(res.status).toBe(200);
  });

  it("rejects undecodable bytes behind an image MIME with 415", async () => {
    const res = await POST(makeUploadReq({ content: "not-an-image-at-all" }), params);
    expect(res.status).toBe(415);
  });

  it("enforces the 12-per-room cap with 409", async () => {
    countResultMock.mockReturnValue([{ value: 12 }]);
    const res = await POST(makeUploadReq(), params);
    expect(res.status).toBe(409);
  });

  it("happy path: stores re-encoded WebP and returns its room-bound URL", async () => {
    const res = await POST(makeUploadReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^\/api\/rooms\/1\/backgrounds\/1-\d+-[0-9a-f]{16}\.webp$/);
  });
});

describe("GET /api/rooms/[id]/backgrounds/[filename]", () => {
  it("serves a room-bound file to members as image/webp", async () => {
    checkRoomAccessMock.mockResolvedValueOnce({ userId: 2, isHost: false, isAdmin: false });
    const res = await GET_FILE(
      new NextRequest("http://localhost/api/rooms/1/backgrounds/1-123-abc.webp"),
      { params: Promise.resolve({ id: "1", filename: "1-123-abc.webp" }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("404s when the filename is stamped with another room's id", async () => {
    checkRoomAccessMock.mockResolvedValueOnce({ userId: 2, isHost: false, isAdmin: false });
    const res = await GET_FILE(
      new NextRequest("http://localhost/api/rooms/1/backgrounds/2-123-abc.webp"),
      { params: Promise.resolve({ id: "1", filename: "2-123-abc.webp" }) }
    );
    expect(res.status).toBe(404);
  });

  it("rejects non-members", async () => {
    checkRoomAccessMock.mockRejectedValueOnce(new Error("Unauthorized: Not a member of this room"));
    const res = await GET_FILE(
      new NextRequest("http://localhost/api/rooms/1/backgrounds/1-123-abc.webp"),
      { params: Promise.resolve({ id: "1", filename: "1-123-abc.webp" }) }
    );
    expect(res.status).toBe(403);
  });
});
