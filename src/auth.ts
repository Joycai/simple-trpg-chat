import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, sqlNow } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { recordLogin } from "@/lib/login-history";
import { authConfig, invalidateSessionCache } from "./auth.config";
import { headers } from "next/headers";

import { isLocked, recordFailure, clearAttempts } from "@/lib/rate-limit";

class BannedError extends CredentialsSignin {
  code = "banned";
}

class RateLimitError extends CredentialsSignin {
  code = "rate_limit";
}

const { handlers, signIn, signOut, auth: nextAuthAuth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        let ip = "127.0.0.1";
        try {
          const h = await headers();
          ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
        } catch {}

        const username = credentials.username as string;
        const ipKey = `ip:${ip}`;
        const userKey = `user:${username}`;

        if (isLocked(ipKey, 10) || isLocked(userKey, 5)) {
          throw new RateLimitError();
        }

        const [user] = await db.select().from(users).where(eq(users.username, username));
        if (!user || user.isBot) {
          recordFailure(ipKey);
          recordFailure(userKey);
          return null;
        }

        if (user.isBanned) {
          throw new BannedError();
        }

        const isPasswordCorrect = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!isPasswordCorrect) {
          recordFailure(ipKey);
          recordFailure(userKey);
          return null;
        }

        // Reset rate limit on success
        clearAttempts(ipKey);
        clearAttempts(userKey);

        // Single-session: generate new token to invalidate old sessions
        // Try-catch: column may not exist if DB hasn't been migrated
        let sessionToken: string | undefined;
        try {
          sessionToken = crypto.randomUUID();
          await db.update(users)
            .set({ sessionToken, updatedAt: sqlNow() })
            .where(eq(users.id, user.id));
          // Drop any stale cached token for this user so the freshly issued
          // session validates immediately, instead of being wrongly kicked as
          // "logged in elsewhere" until the 30s cache entry expires.
          invalidateSessionCache(user.id.toString());
        } catch {
          // session_token column doesn't exist yet — non-blocking
          sessionToken = undefined;
        }

        // Record login history (fire-and-forget, non-blocking)
        recordLogin(user.id).catch(() => {});

        return {
          id: user.id.toString(),
          name: user.displayName,
          username: user.username,
          role: user.role,
          sessionToken,
        };
      },
    }),
  ],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = async (...args: any[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (nextAuthAuth as any)(...args);
  if (session && (session as { invalidated?: boolean }).invalidated) {
    return null;
  }
  return session;
};

export { handlers, signIn, signOut };
