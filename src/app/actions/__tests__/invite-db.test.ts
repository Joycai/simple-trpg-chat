import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inviteCodes, users } from "@/db/schema";

vi.mock("@/auth", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

describe.skipIf(process.env.TEST_RUNTIME_DATABASE !== "1")("registration with PostgreSQL", () => {
  let db: typeof import("@/db")["db"];
  let register: typeof import("../invite")["registerAction"];
  let newCode: typeof import("@/lib/auth/invites")["generateInviteCode"];
  let hostId: number;
  const usernames = new Set<string>();
  const username = () => {
    const name = `test_${randomBytes(6).toString("hex")}`;
    usernames.add(name);
    return name;
  };

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    ({ registerAction: register } = await import("../invite"));
    ({ generateInviteCode: newCode } = await import("@/lib/auth/invites"));
    const [host] = await db.insert(users)
      .values({ username: username(), passwordHash: "fixture", displayName: "Host", role: "host" })
      .returning();
    hostId = host.id;
  });

  afterAll(async () => {
    if (hostId) await db.delete(inviteCodes).where(eq(inviteCodes.creatorId, hostId));
    if (db && usernames.size) await db.delete(users).where(inArray(users.username, [...usernames]));
  });

  async function issue() {
    const code = newCode();
    await db.insert(inviteCodes).values({
      code,
      creatorId: hostId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return code;
  }

  async function signup(code: string, name: string) {
    const form = new FormData();
    form.set("code", code);
    form.set("username", name);
    form.set("password", "ValidTestPassword");
    return register(form);
  }

  it("hides taken usernames when the code is invalid and rolls back valid-code claims on conflict", async () => {
    const code = await issue();
    const taken = [...usernames][0];
    expect(await signup(newCode(), taken)).toEqual({ success: false, error: "errorInvalidCode" });
    expect(await signup(code, taken)).toEqual({ success: false, error: "errorUsernameTaken" });
    const [unspent] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    expect(unspent).toMatchObject({ status: "active", usedAt: null, usedByUserId: null });
    expect(await signup(code, username())).toEqual({ success: true });
  });

  it("keeps the losing invite active when concurrent registrations choose the same username", async () => {
    const codes = [await issue(), await issue()];
    const name = username();
    const outcomes = await Promise.all(codes.map((code) => signup(code, name)));
    expect(outcomes.filter((outcome) => outcome.success)).toHaveLength(1);
    expect(outcomes).toContainEqual({ success: false, error: "errorUsernameTaken" });
    const stored = await db.select().from(inviteCodes).where(inArray(inviteCodes.code, codes));
    expect(stored.map(({ status }) => status).sort()).toEqual(["active", "used"]);
  });
});
