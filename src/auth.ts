import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, sqlNow } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
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

        const isPasswordCorrect = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!isPasswordCorrect) return null;

        // Single-session: generate new token to invalidate old sessions
        const sessionToken = crypto.randomUUID();
        await db.update(users)
          .set({ sessionToken, updatedAt: sqlNow() })
          .where(eq(users.id, user.id));

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
