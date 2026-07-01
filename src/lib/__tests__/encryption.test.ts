import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../encryption";

describe("Encryption Helper", () => {
  beforeAll(() => {
    process.env.AI_ENCRYPTION_KEY = "test-secret-key-must-be-very-long-and-secure";
    process.env.AI_ENCRYPTION_SALT = "test-salt";
  });

  it("should encrypt and decrypt a string successfully", () => {
    const text = "hello simple trpg chat!";
    const encrypted = encrypt(text);
    expect(encrypted).not.toBe(text);
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it("should support fallback salt if env salt is missing", async () => {
    delete process.env.AI_ENCRYPTION_SALT;
    // The derived key is cached at module scope, so re-import a fresh module
    // instance to actually exercise the fallback-salt branch rather than
    // reusing the key already cached (with the salt) by the previous test.
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("../encryption");

    const text = "fallback salt test";
    const encrypted = fresh.encrypt(text);
    const decrypted = fresh.decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
