import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { CredentialsConfig } from "next-auth/providers/credentials";

const { registerProvider, compare, select, updateWhere } = vi.hoisted(() => ({
  registerProvider: vi.fn<(config: CredentialsConfig) => CredentialsConfig>((config) => config),
  compare: vi.fn(),
  select: vi.fn(),
  updateWhere: vi.fn<(condition: SQL) => { returning: () => Promise<{ id: number }[]> }>(),
}));
vi.mock("next-auth", () => ({ default: () => ({}), CredentialsSignin: Error }));
vi.mock("next-auth/providers/credentials", () => ({ default: registerProvider }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("bcryptjs", () => ({ default: { compare } }));
vi.mock("@/db", () => ({
  db: { select, update: () => ({ set: () => ({ where: updateWhere }) }) },
  sqlNow: () => "NOW()",
}));
vi.mock("@/lib/auth/login-history", () => ({ recordLogin: async () => {} }));
vi.mock("@/lib/auth/rate-limit", () => ({ isLocked: () => false, recordFailure: vi.fn(), clearAttempts: vi.fn() }));

import "../auth";

const account = { id: 2, username: "bob", role: "admin", passwordHash: "verified-hash", isBanned: false };
const authorize = registerProvider.mock.calls[0][0].authorize;

beforeEach(() => {
  compare.mockReset().mockResolvedValue(true);
  select.mockReturnValue({ from: () => ({ where: async () => [account] }) });
  updateWhere.mockReset().mockReturnValue({ returning: async () => [{ id: account.id }] });
});

it("issues a token only if the verified password hash and role still match and the account is unbanned", async () => {
  const result = await authorize({ username: "bob", password: "password" }, new Request("http://localhost"));
  expect(result).toMatchObject({ id: "2", role: "admin", sessionToken: expect.any(String) });
  const predicate = new PgDialect().sqlToQuery(updateWhere.mock.calls[0][0]);
  expect(predicate.sql).toContain('"users"."password_hash"');
  expect(predicate.sql).toContain('"users"."role"');
  expect(predicate.sql).toContain('"users"."is_banned"');
  expect(predicate.params).toEqual([2, "verified-hash", "admin", false]);
});

it("rejects login when the conditional write no longer matches", async () => {
  updateWhere.mockReturnValue({ returning: async () => [] });
  expect(await authorize({ username: "bob", password: "password" }, new Request("http://localhost"))).toBeNull();
});
