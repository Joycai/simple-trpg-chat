import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordTokenUsage } from "../ai_usage";
import { db } from "@/db";

// Mock database and sql helper
vi.mock("@/db", () => {
  const mockInsert = vi.fn().mockImplementation(() => {
    const chain = {
      values: vi.fn().mockImplementation(() => {
        const promise = Promise.resolve(null);
        return Object.assign(promise, {
          onConflictDoUpdate: vi.fn().mockResolvedValue(null)
        });
      })
    };
    return chain;
  });
  
  const mockSelect = vi.fn().mockImplementation(() => {
    const limitFn = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve([]);
      return Object.assign(promise, {
        for: vi.fn().mockResolvedValue([]),
      });
    });
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: limitFn,
        }),
      }),
    };
  });

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(null)
    })
  });

  const mockTransaction = vi.fn().mockImplementation(async (cb) => {
    return await cb({
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    });
  });

  return {
    db: {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      transaction: mockTransaction,
    },
    sqlNow: vi.fn(),
  };
});

describe("AI Usage & Billing Deductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate and deduct point balance for shared providers", async () => {
    // Mock provider is shared and rates per 1M tokens
    const mockProvider = {
      id: 1,
      isShared: true,
      tokenRateInput: 0.15,
      tokenRateCached: 0.075,
      tokenRateOutput: 0.60,
    };
    
    // Mock user has role 'player' and 50 points
    const mockUser = {
      id: 10,
      role: "player",
      aiPoints: 50.0,
    };

    // Setup select mock queries
    const selectMock = vi.mocked(db.select);
    selectMock.mockImplementationOnce(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockProvider])
          })
        })
      } as unknown as ReturnType<typeof import("@/db").db.select>;
    });

    selectMock.mockImplementationOnce(() => {
      const limitFn = vi.fn().mockImplementation(() => {
        const promise = Promise.resolve([mockUser]);
        return Object.assign(promise, {
          for: vi.fn().mockResolvedValue([mockUser])
        });
      });
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitFn
          })
        })
      } as unknown as ReturnType<typeof import("@/db").db.select>;
    });

    // Run token recorder
    // Total Input: 3,000,000, Cached: 2,000,000, Output: 500,000
    // Net Input: 3,000,000 - 2,000,000 = 1,000,000
    // Expected points: (1.0 * 0.15) + (2.0 * 0.075) + (0.5 * 0.60) = 0.15 + 0.15 + 0.30 = 0.60 points
    await recordTokenUsage(10, 1, 3000000, 2000000, 500000);

    // Verify insert token usage stats is called
    expect(db.insert).toHaveBeenCalled();

    // Verify update user points is called with deduction
    expect(db.update).toHaveBeenCalled();
  });

  it("should skip deductions for admin users", async () => {
    const mockProvider = {
      id: 1,
      isShared: true,
      tokenRateInput: 0.01,
      tokenRateCached: 0.005,
      tokenRateOutput: 0.02,
    };
    
    const mockUser = {
      id: 10,
      role: "admin",
      aiPoints: 50.0,
    };

    const selectMock = vi.mocked(db.select);
    selectMock.mockImplementationOnce(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockProvider])
          })
        })
      } as unknown as ReturnType<typeof import("@/db").db.select>;
    });

    selectMock.mockImplementationOnce(() => {
      const limitFn = vi.fn().mockImplementation(() => {
        const promise = Promise.resolve([mockUser]);
        return Object.assign(promise, {
          for: vi.fn().mockResolvedValue([mockUser])
        });
      });
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: limitFn
          })
        })
      } as unknown as ReturnType<typeof import("@/db").db.select>;
    });

    await recordTokenUsage(10, 1, 100, 50, 200);

    // Verify insert is called but update is NOT called
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("should skip deductions for private/unshared providers", async () => {
    const mockProvider = {
      id: 1,
      isShared: false,
      tokenRateInput: 0.01,
      tokenRateCached: 0.005,
      tokenRateOutput: 0.02,
    };

    const selectMock = vi.mocked(db.select);
    selectMock.mockImplementationOnce(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockProvider])
          })
        })
      } as unknown as ReturnType<typeof import("@/db").db.select>;
    });

    await recordTokenUsage(10, 1, 100, 50, 200);

    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
