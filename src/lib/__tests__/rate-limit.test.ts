import { describe, it, expect, beforeEach, vi } from "vitest";
import { loginLimitMap, isLocked, recordFailure, clearAttempts } from "../rate-limit";

describe("Login Rate Limiting", () => {
  beforeEach(() => {
    loginLimitMap.clear();
  });

  it("should record failures and lock key after threshold", () => {
    const key = "user:testuser";

    // Not locked initially
    expect(isLocked(key, 5)).toBe(false);

    // Record 4 failures
    for (let i = 0; i < 4; i++) {
      recordFailure(key);
    }
    expect(isLocked(key, 5)).toBe(false);

    // 5th failure should lock the account
    recordFailure(key);
    expect(isLocked(key, 5)).toBe(true);
  });

  it("should lock IP after different threshold", () => {
    const key = "ip:127.0.0.1";

    expect(isLocked(key, 10)).toBe(false);

    for (let i = 0; i < 9; i++) {
      recordFailure(key);
    }
    expect(isLocked(key, 10)).toBe(false);

    recordFailure(key);
    expect(isLocked(key, 10)).toBe(true);
  });

  it("should clear attempts when clearAttempts is called", () => {
    const key = "user:testuser";

    for (let i = 0; i < 5; i++) {
      recordFailure(key);
    }
    expect(isLocked(key, 5)).toBe(true);

    clearAttempts(key);
    expect(isLocked(key, 5)).toBe(false);
  });

  it("should reset rate limit after window expires", () => {
    const key = "user:testuser";
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      recordFailure(key, 60000); // 1 minute window
    }
    expect(isLocked(key, 5)).toBe(true);

    // Advance time by 61 seconds
    vi.advanceTimersByTime(61000);

    // Should not be locked anymore because resetTime has passed
    expect(isLocked(key, 5)).toBe(false);

    vi.useRealTimers();
  });
});
