import { describe, it, expect } from "vitest";
import path from "path";
import {
  CHAT_IMAGE_MAX_BYTES,
  isAllowedImageMime,
  extForMime,
  getChatImageDir,
  resolveChatImagePath,
} from "../uploads";

describe("uploads helpers", () => {
  it("caps image size at 1MB", () => {
    expect(CHAT_IMAGE_MAX_BYTES).toBe(1024 * 1024);
  });

  describe("isAllowedImageMime / extForMime", () => {
    it("accepts supported image mime types", () => {
      expect(isAllowedImageMime("image/jpeg")).toBe(true);
      expect(isAllowedImageMime("image/png")).toBe(true);
      expect(isAllowedImageMime("image/gif")).toBe(true);
      expect(isAllowedImageMime("image/webp")).toBe(true);
    });

    it("rejects unsupported / non-image types", () => {
      expect(isAllowedImageMime("image/svg+xml")).toBe(false);
      expect(isAllowedImageMime("application/pdf")).toBe(false);
      expect(isAllowedImageMime("text/html")).toBe(false);
      expect(isAllowedImageMime("")).toBe(false);
    });

    it("maps mime to canonical extension", () => {
      expect(extForMime("image/jpeg")).toBe("jpg");
      expect(extForMime("image/png")).toBe("png");
      expect(extForMime("image/svg+xml")).toBeNull();
    });
  });

  describe("resolveChatImagePath", () => {
    const dir = getChatImageDir();

    it("resolves a plain filename inside the cache dir", () => {
      const resolved = resolveChatImagePath("5-123456-abcdef.jpg");
      expect(resolved).toBe(path.join(dir, "5-123456-abcdef.jpg"));
    });

    it("rejects path traversal attempts", () => {
      expect(resolveChatImagePath("../secret.txt")).toBeNull();
      expect(resolveChatImagePath("../../etc/passwd")).toBeNull();
      expect(resolveChatImagePath("..")).toBeNull();
    });

    it("rejects path separators and nested segments", () => {
      expect(resolveChatImagePath("sub/dir/file.jpg")).toBeNull();
      expect(resolveChatImagePath("/abs/path.jpg")).toBeNull();
      expect(resolveChatImagePath("a\\b.jpg")).toBeNull();
    });

    it("rejects empty / unsafe names", () => {
      expect(resolveChatImagePath("")).toBeNull();
      expect(resolveChatImagePath("file name.jpg")).toBeNull();
      expect(resolveChatImagePath("file%2e%2e.jpg")).toBeNull();
    });
  });
});
