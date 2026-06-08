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

  it("should support fallback salt if env salt is missing", () => {
    delete process.env.AI_ENCRYPTION_SALT;
    const text = "fallback salt test";
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
