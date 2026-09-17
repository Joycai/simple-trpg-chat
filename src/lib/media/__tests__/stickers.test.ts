import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getStickerManifest,
  resolveStickerPath,
  isValidStickerRef,
  mimeForSticker,
} from "../stickers";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "stickers-test-"));
  // Pack with a CJK name to exercise encoding handling.
  fs.mkdirSync(path.join(dir, "黄豆"));
  fs.writeFileSync(path.join(dir, "黄豆", "01-smile.svg"), "<svg/>");
  fs.writeFileSync(path.join(dir, "黄豆", "02-laugh.png"), "x");
  fs.writeFileSync(path.join(dir, "黄豆", "notes.txt"), "ignored"); // non-image, skipped
  fs.mkdirSync(path.join(dir, "empty")); // no images, skipped
  process.env.STICKER_DIR = dir;
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.STICKER_DIR;
});

beforeEach(() => {
  // Reset the cached manifest so each test re-scans.
  globalThis.__stickerManifest = undefined;
});

describe("getStickerManifest", () => {
  it("scans packs, skips non-image files and empty packs", () => {
    const manifest = getStickerManifest();
    expect(manifest).toHaveLength(1);
    const pack = manifest[0];
    expect(pack.pack).toBe("黄豆");
    expect(pack.label).toBe("黄豆");
    expect(pack.stickers.map((s) => s.id)).toEqual(["01-smile.svg", "02-laugh.png"]);
  });

  it("emits percent-encoded URLs for CJK segments", () => {
    const url = getStickerManifest()[0].stickers[0].url;
    expect(url).toBe(`/api/stickers/${encodeURIComponent("黄豆")}/01-smile.svg`);
  });

  it("caches across calls (same array reference)", () => {
    expect(getStickerManifest()).toBe(getStickerManifest());
  });
});

describe("resolveStickerPath", () => {
  it("resolves a valid (pack, file)", () => {
    expect(resolveStickerPath("黄豆", "01-smile.svg")).toBe(
      path.join(dir, "黄豆", "01-smile.svg")
    );
  });

  it("rejects path traversal", () => {
    expect(resolveStickerPath("..", "x.png")).toBeNull();
    expect(resolveStickerPath("黄豆", "../../etc/passwd")).toBeNull();
    expect(resolveStickerPath("黄豆/..", "01-smile.svg")).toBeNull();
  });

  it("rejects disallowed extensions", () => {
    expect(resolveStickerPath("黄豆", "notes.txt")).toBeNull();
  });
});

describe("isValidStickerRef", () => {
  it("accepts a ref present in the manifest", () => {
    expect(isValidStickerRef(`/api/stickers/${encodeURIComponent("黄豆")}/01-smile.svg`)).toBe(true);
  });

  it("rejects refs not in the manifest", () => {
    expect(isValidStickerRef(`/api/stickers/${encodeURIComponent("黄豆")}/missing.svg`)).toBe(false);
    expect(isValidStickerRef("/api/stickers/ghost/01-smile.svg")).toBe(false);
  });

  it("rejects malformed refs", () => {
    expect(isValidStickerRef("https://evil.example/x.png")).toBe(false);
    expect(isValidStickerRef("/api/rooms/1/images/x.png")).toBe(false);
    expect(isValidStickerRef("")).toBe(false);
  });
});

describe("mimeForSticker", () => {
  it("maps known extensions", () => {
    expect(mimeForSticker("a.svg")).toBe("image/svg+xml");
    expect(mimeForSticker("a.PNG")).toBe("image/png");
    expect(mimeForSticker("a.jpg")).toBe("image/jpeg");
  });
  it("returns null for unknown", () => {
    expect(mimeForSticker("a.txt")).toBeNull();
  });
});
