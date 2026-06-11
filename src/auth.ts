import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, sqlNow } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { recordLogin } from "@/lib/login-history";
import { authConfig } from "./auth.config";

class BannedError extends CredentialsSignin {
  code = "banned";
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

        const [user] = await db.select().from(users).where(eq(users.username, credentials.username as string));
        if (!user || user.isBot) return null;

        if (user.isBanned) {
          throw new BannedError();
        }

        const isPasswordCorrect = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!isPasswordCorrect) return null;

        // Single-session: generate new token to invalidate old sessions
        // Try-catch: column may not exist if DB hasn't been migrated
        let sessionToken: string | undefined;
        try {
          sessionToken = crypto.randomUUID();
          await db.update(users)
            .set({ sessionToken, updatedAt: sqlNow() })
            .where(eq(users.id, user.id));
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

export const auth = async (...args: any[]) => {
  const session = await (nextAuthAuth as any)(...args);
  if (session && (session as any).invalidated) {
    return null;
  }
  return session;
};

export { handlers, signIn, signOut };
