export const loginLimitMap = new Map<string, { count: number; resetTime: number }>();


// Periodically sweep expired entries to prevent unbounded memory growth
// Note: this rate limiter is single-process only and not effective in multi-worker deployments
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginLimitMap) {
    if (now > record.resetTime) loginLimitMap.delete(key);
  }
}, 5 * 60 * 1000).unref();

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
