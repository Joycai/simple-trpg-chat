import { describe, it, expect } from "vitest";
import path from "path";
import {
  isAllowedBackgroundMime,
  resolveRoomBackgroundPath,
  getRoomBackgroundDir,
  roomBackgroundUrl,
  BACKGROUND_UPLOAD_MAX_BYTES,
  ROOM_BACKGROUND_MAX_COUNT,
} from "@/lib/backgrounds";

describe("isAllowedBackgroundMime", () => {
  it("accepts JPEG / PNG / WebP", () => {
    expect(isAllowedBackgroundMime("image/jpeg")).toBe(true);
    expect(isAllowedBackgroundMime("image/png")).toBe(true);
    expect(isAllowedBackgroundMime("image/webp")).toBe(true);
  });

  it("rejects GIF outright (design decision: no animated backgrounds)", () => {
    expect(isAllowedBackgroundMime("image/gif")).toBe(false);
  });

  it("rejects non-image and lookalike MIMEs", () => {
    expect(isAllowedBackgroundMime("image/svg+xml")).toBe(false);
    expect(isAllowedBackgroundMime("application/octet-stream")).toBe(false);
    expect(isAllowedBackgroundMime("text/html")).toBe(false);
    expect(isAllowedBackgroundMime("")).toBe(false);
  });
});

describe("resolveRoomBackgroundPath", () => {
  it("resolves a plain minted filename inside the background dir", () => {
    const p = resolveRoomBackgroundPath("12-1700000000000-abcdef0123456789.webp");
    expect(p).not.toBeNull();
    expect(path.dirname(p!)).toBe(getRoomBackgroundDir());
  });

  it("rejects path traversal and multi-segment names", () => {
    expect(resolveRoomBackgroundPath("../secret.webp")).toBeNull();
    expect(resolveRoomBackgroundPath("..%2Fsecret.webp")).toBeNull();
    expect(resolveRoomBackgroundPath("a/b.webp")).toBeNull();
    expect(resolveRoomBackgroundPath("a\\b.webp")).toBeNull();
    expect(resolveRoomBackgroundPath("..")).toBeNull();
    expect(resolveRoomBackgroundPath("")).toBeNull();
  });
});

describe("constants & URL", () => {
  it("keeps the agreed limits (5MB upload, 12 per room)", () => {
    expect(BACKGROUND_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(ROOM_BACKGROUND_MAX_COUNT).toBe(12);
  });

  it("builds the serving URL", () => {
    expect(roomBackgroundUrl(7, "7-1-aa.webp")).toBe("/api/rooms/7/backgrounds/7-1-aa.webp");
  });
});
