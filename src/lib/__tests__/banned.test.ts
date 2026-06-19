import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSessionStatus } from "../../auth.config";

// Setup mocks for database queries
const mockSelect = vi.fn();

vi.mock("../../db", () => {
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

    const { status, kickedFromIp } = await getSessionStatus("3", "token123");
    expect(status).toBe("token_mismatch");
    // IP lookup uses orderBy/limit not present in this mock → resolves to undefined, not a throw
    expect(kickedFromIp).toBeUndefined();
  });

  it("should fail closed with 'unavailable' on a DB error", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    const { status } = await getSessionStatus("4", "token123");
    expect(status).toBe("unavailable");
  });
});
