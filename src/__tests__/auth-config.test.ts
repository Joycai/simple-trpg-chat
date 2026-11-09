import { describe, it, expect, vi, beforeEach } from "vitest";
import { authConfig, getSessionStatus } from "../auth.config";

// Setup mocks for database queries
const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("../db/index", () => {
  return {
    db: {
      select: mockSelect,
    },
  };
});

describe("Account Banning & Single-Session Invalidation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSelect.mockReset();
  });

  it("should report 'banned' when the user is banned", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token123", isBanned: true }])),
      })),
    });

    const { status } = await getSessionStatus("1", "token123");
    expect(status).toBe("banned");
  });

  it("should report 'valid' when not banned and token matches", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token123", isBanned: false }])),
      })),
    });

    const { status } = await getSessionStatus("2", "token123");
    expect(status).toBe("valid");
  });

  it("should report 'token_mismatch' when the DB token differs (kicked by newer login)", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token999", isBanned: false }])),
      })),
    });

    const check = await getSessionStatus("3", "token123");
    expect(check.status).toBe("token_mismatch");
    // IP lookup uses orderBy/limit not present in this mock → resolves to undefined, not a throw
    expect(check).toEqual({ status: "token_mismatch", kickedFromIp: undefined });
  });

  it("rejects a previously valid token as soon as the stored token rotates", async () => {
    let sessionToken = "tok-old";
    mockSelect.mockReturnValue({
      from: () => ({
        where: async () => [{ sessionToken, isBanned: false }],
      }),
    });
    expect((await getSessionStatus("99", "tok-old")).status).toBe("valid");

    sessionToken = "tok-new";
    expect((await getSessionStatus("99", "tok-old")).status).toBe("token_mismatch");
    expect((await getSessionStatus("99", "tok-new")).status).toBe("valid");
  });

  it("uses the current database role even when a legacy JWT claims admin", async () => {
    mockSelect.mockReturnValue({
      from: () => ({ where: async () => [{ sessionToken: "tok", isBanned: false, role: "player" }] }),
    });
    const user = { id: "2", name: "Player", role: "admin", username: "player", email: "", emailVerified: null };
    // NextAuth types intersect database and JWT session shapes. Exercise the JWT shape.
    const input = {
      session: { user, expires: "" },
      token: { sub: "2", sessionToken: "tok", role: "admin" },
    } as unknown as Parameters<typeof authConfig.callbacks.session>[0];
    const session = await authConfig.callbacks.session(input);
    expect(session.user.role).toBe("player");
  });

  it("should fail closed with 'unavailable' on a DB error", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    const { status } = await getSessionStatus("4", "token123");
    expect(status).toBe("unavailable");
  });
});
