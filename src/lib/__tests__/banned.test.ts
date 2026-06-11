import { describe, it, expect, vi, beforeEach } from "vitest";
import { isSessionValid } from "../../auth.config";

// Setup mocks for database queries
const mockSelect = vi.fn();

vi.mock("../../db", () => {
  return {
    db: {
      select: mockSelect,
    },
  };
});

describe("Account Banning & Session Invalidation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSelect.mockReset();
  });

  it("should invalidate session if user is banned", async () => {
    // Mock user select returning banned user
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token123", isBanned: true }])),
      })),
    });

    const isValid = await isSessionValid("1", "token123");
    expect(isValid).toBe(false);
  });

  it("should validate session if user is not banned and token matches", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token123", isBanned: false }])),
      })),
    });

    const isValid = await isSessionValid("2", "token123");
    expect(isValid).toBe(true);
  });

  it("should invalidate session if user token does not match", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ sessionToken: "token999", isBanned: false }])),
      })),
    });

    const isValid = await isSessionValid("3", "token123");
    expect(isValid).toBe(false);
  });
});
