import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, sqlNow } from "./db";
import { users } from "./db/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { recordLogin } from "@/lib/auth/login-history";
import { authConfig } from "./auth.config";
import { headers } from "next/headers";

import { isLocked, recordFailure, clearAttempts } from "@/lib/auth/rate-limit";

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

        // Only issue a session for the credentials and role we just verified.
        // A password reset, role change or ban can commit during bcrypt.compare.
        const sessionToken = crypto.randomUUID();
        const [issued] = await db.update(users)
          .set({ sessionToken, updatedAt: sqlNow() })
          .where(and(
            eq(users.id, user.id),
            eq(users.passwordHash, user.passwordHash),
            eq(users.role, user.role),
            eq(users.isBanned, false),
          ))
          .returning({ id: users.id });
        if (!issued) return null;

        clearAttempts(ipKey);
        clearAttempts(userKey);

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
