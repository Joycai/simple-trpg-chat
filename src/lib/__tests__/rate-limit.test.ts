import { describe, it, expect, beforeEach, vi } from "vitest";
import { loginLimitMap, isLocked, recordFailure, clearAttempts } from "../rate-limit";

describe("Login Rate Limiting", () => {
  beforeEach(() => {
    loginLimitMap.clear();
  });

  it.each([
    ["user:testuser", 5],
    ["ip:127.0.0.1", 10],
  ])("should record failures and lock key after threshold (key=%s, limit=%i)", (key, limit) => {
    // Not locked initially
    expect(isLocked(key, limit)).toBe(false);

    // Record limit-1 failures
    for (let i = 0; i < limit - 1; i++) {
      recordFailure(key);
    }
    expect(isLocked(key, limit)).toBe(false);

    // Final failure should lock the key
    recordFailure(key);
    expect(isLocked(key, limit)).toBe(true);
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
