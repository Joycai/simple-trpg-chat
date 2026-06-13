export const loginLimitMap = new Map<string, { count: number; resetTime: number }>();

export function isLocked(key: string, limit = 5): boolean {
  const now = Date.now();
  const record = loginLimitMap.get(key);
  if (record && record.resetTime > now && record.count >= limit) {
    return true;
  }
  return false;
}

export function recordFailure(key: string, windowMs = 60 * 1000) {
  const now = Date.now();
  const record = loginLimitMap.get(key);
  if (!record || record.resetTime <= now) {
    loginLimitMap.set(key, { count: 1, resetTime: now + windowMs });
  } else {
    record.count += 1;
  }
}

export function clearAttempts(key: string) {
  loginLimitMap.delete(key);
}
