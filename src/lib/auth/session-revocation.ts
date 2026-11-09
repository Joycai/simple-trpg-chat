import "server-only";
import { db, sqlNow } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { invalidateSessionCache } from "@/auth.config";

/**
 * Revoke every existing JWT for `userId` by rotating the single-session token.
 * The token is baked into the JWT at sign-in and re-checked on every request
 * (`getSessionStatus`), so writing a new value invalidates old cookies even
 * though the JWT itself is still cryptographically valid — which is exactly
 * what a role change or password reset must do.
 *
 * Also drops the 30s in-process cache entry, otherwise the worker that served
 * the mutation would keep accepting the old token until the TTL expired.
 *
 * `keepToken: false` clears the token entirely (used by logout).
 */
export async function revokeSessions(userId: number, opts?: { keepToken?: boolean }): Promise<void> {
  if (!Number.isInteger(userId)) return;
  try {
    await db.update(users)
      .set({
        sessionToken: opts?.keepToken === false ? null : crypto.randomUUID(),
        updatedAt: sqlNow(),
      })
      .where(eq(users.id, userId));
  } finally {
    invalidateSessionCache(String(userId));
  }
}
