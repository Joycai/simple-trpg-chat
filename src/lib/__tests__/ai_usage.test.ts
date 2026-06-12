import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordTokenUsage } from "../ai_usage";
import { db } from "@/db";

// Mock database and sql helper
vi.mock("@/db", () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(null)
    })
  });
  
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([])
      })
    })
  });

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(null)
    })
  });

  return {
    db: {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    },
    sqlNow: vi.fn(),
  };
});

describe("AI Usage & Billing Deductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate and deduct point balance for shared providers", async () => {
    // Mock provider is shared and rates
    const mockProvider = {
      id: 1,
      isShared: true,
      tokenRateInput: 0.01,
      tokenRateCached: 0.005,
      tokenRateOutput: 0.02,
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
      } as any;
    });

    selectMock.mockImplementationOnce(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser])
          })
        })
      } as any;
    });

    // Run token recorder
    // Input: 100, Cached: 50, Output: 200
    // Expected points: (100 * 0.01) + (50 * 0.005) + (200 * 0.02) = 1.0 + 0.25 + 4.0 = 5.25 points
    await recordTokenUsage(10, 1, 100, 50, 200);

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
      } as any;
    });

    selectMock.mockImplementationOnce(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockUser])
          })
        })
      } as any;
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
      } as any;
    });

    await recordTokenUsage(10, 1, 100, 50, 200);

    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
