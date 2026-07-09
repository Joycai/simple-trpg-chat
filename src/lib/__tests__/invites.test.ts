import { describe, it, expect, vi } from "vitest";

// invites.ts imports @/db for the sweep/config helpers; the pure functions
// under test never touch it, so stub the module to avoid a real connection.
vi.mock("@/db", () => ({ db: {}, sqlNow: () => undefined }));

import {
  generateInviteCode,
  normalizeInviteCode,
  clampDefaultQuota,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_TTL_HOURS,
} from "../invites";

describe("generateInviteCode", () => {
  it("produces canonical XXXX-XXXX-XXXX form", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    }
  });

  it("never emits confusable characters (0/O, 1/I/L, U)", () => {
    for (let i = 0; i < 50; i++) {
      const raw = generateInviteCode().replace(/-/g, "");
      for (const ch of raw) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
        expect("0O1ILU").not.toContain(ch);
      }
    }
  });

  it("does not repeat across a small sample (sanity, 59-bit space)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateInviteCode());
    expect(seen.size).toBe(1000);
  });
});

describe("normalizeInviteCode", () => {
  it("round-trips generated codes", () => {
    const code = generateInviteCode();
    expect(normalizeInviteCode(code)).toBe(code);
  });

  it("accepts lowercase, spaces and missing dashes", () => {
    expect(normalizeInviteCode("abcd efgh 2345")).toBe("ABCD-EFGH-2345");
    expect(normalizeInviteCode("abcdefgh2345")).toBe("ABCD-EFGH-2345");
    expect(normalizeInviteCode("ABCD-EFGH-2345")).toBe("ABCD-EFGH-2345");
  });

  it("rejects wrong length", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode("ABCD-EFGH")).toBeNull();
    expect(normalizeInviteCode("ABCD-EFGH-2345-2345")).toBeNull();
  });

  it("rejects characters outside the alphabet", () => {
    expect(normalizeInviteCode("ABC0-EFGH-2345")).toBeNull(); // 0
    expect(normalizeInviteCode("ABC1-EFGH-2345")).toBeNull(); // 1
    expect(normalizeInviteCode("ABCI-EFGH-2345")).toBeNull(); // I
    expect(normalizeInviteCode("ABCO-EFGH-2345")).toBeNull(); // O
    expect(normalizeInviteCode("ABCL-EFGH-2345")).toBeNull(); // L
    expect(normalizeInviteCode("ABCU-EFGH-2345")).toBeNull(); // U
    expect(normalizeInviteCode("ABC!-EFGH-2345")).toBeNull();
  });
});

describe("clampDefaultQuota", () => {
  it("clamps to 0–99 integers", () => {
    expect(clampDefaultQuota(4)).toBe(4);
    expect(clampDefaultQuota("4")).toBe(4);
    expect(clampDefaultQuota(0)).toBe(0);
    expect(clampDefaultQuota(-5)).toBe(0);
    expect(clampDefaultQuota(150)).toBe(99);
    expect(clampDefaultQuota(4.9)).toBe(4);
  });

  it("falls back to 4 on garbage", () => {
    expect(clampDefaultQuota("abc")).toBe(4);
    expect(clampDefaultQuota(undefined)).toBe(4);
    expect(clampDefaultQuota(NaN)).toBe(4);
  });
});

describe("constants", () => {
  it("TTL is 48 hours per the design", () => {
    expect(INVITE_CODE_TTL_HOURS).toBe(48);
  });

  it("alphabet has 30 unambiguous symbols", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(30);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(30);
  });
});
