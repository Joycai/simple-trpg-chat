"use server";

/**
 * Invite-code actions: host-side generation/list/revoke and the public
 * registration flow. Design: docs/design/invite-registration.md.
 *
 * All actions return result objects (never throw) per project convention.
 */

import { db } from "@/db";
import { inviteCodes, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getTranslations } from "next-intl/server";
import {
  generateInviteCode,
  normalizeInviteCode,
  sweepExpiredInvites,
  getInviteConfig,
  INVITE_CODE_TTL_HOURS,
} from "@/lib/invites";
import { isLocked, recordFailure } from "@/lib/rate-limit";

// ============================================================
// Host-side actions
// ============================================================

async function requireHost() {
  const session = await auth();
  if (!session || session.user.role !== "host") return null;
  const userId = parseInt(session.user.id);
  return isNaN(userId) ? null : userId;
}

export interface InviteCodeView {
  id: number;
  code: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByName: string | null;
}

export async function generateInviteCodeAction() {
  const t = await getTranslations("invites");
  const userId = await requireHost();
  if (!userId) return { success: false as const, error: t("errorNotHost") };

  try {
    const result = await db.transaction(async (tx) => {
      await sweepExpiredInvites(tx);

      // Conditional decrement — the `invite_quota > 0` guard makes concurrent
      // generation attempts unable to overdraw the quota.
      const [quotaRow] = await tx
        .update(users)
        .set({ inviteQuota: sql`${users.inviteQuota} - 1` })
        .where(and(eq(users.id, userId), sql`${users.inviteQuota} > 0`))
        .returning({ remaining: users.inviteQuota });
      if (!quotaRow) return null;

      // 59 bits of entropy: a unique-index collision is practically impossible.
      // If one ever happens the transaction fails and the host just retries.
      const [row] = await tx
        .insert(inviteCodes)
        .values({
          code: generateInviteCode(),
          creatorId: userId,
          expiresAt: sql`NOW() + make_interval(hours => ${INVITE_CODE_TTL_HOURS})`,
        })
        .returning({ code: inviteCodes.code, expiresAt: inviteCodes.expiresAt });
      return { ...row, remaining: quotaRow.remaining };
    });

    if (!result) return { success: false as const, error: t("errorNoQuota") };
    return { success: true as const, ...result };
  } catch (err: unknown) {
    return { success: false as const, error: err instanceof Error ? err.message : t("errorUnknown") };
  }
}

export async function listMyInviteCodesAction() {
  const t = await getTranslations("invites");
  const userId = await requireHost();
  if (!userId) return { success: false as const, error: t("errorNotHost") };

  try {
    const data = await db.transaction(async (tx) => {
      await sweepExpiredInvites(tx);

      const usedBy = users; // alias clarity: joined for the consumer's name
      const rows = await tx
        .select({
          id: inviteCodes.id,
          code: inviteCodes.code,
          status: inviteCodes.status,
          createdAt: inviteCodes.createdAt,
          expiresAt: inviteCodes.expiresAt,
          usedAt: inviteCodes.usedAt,
          usedByName: usedBy.displayName,
        })
        .from(inviteCodes)
        .leftJoin(usedBy, eq(inviteCodes.usedByUserId, usedBy.id))
        .where(eq(inviteCodes.creatorId, userId))
        .orderBy(desc(inviteCodes.createdAt));

      const [me] = await tx.select({ quota: users.inviteQuota }).from(users).where(eq(users.id, userId));
      return { codes: rows as InviteCodeView[], quota: me?.quota ?? 0 };
    });

    const config = await getInviteConfig();
    return { success: true as const, ...data, defaultQuota: config.defaultQuota };
  } catch (err: unknown) {
    return { success: false as const, error: err instanceof Error ? err.message : t("errorUnknown") };
  }
}

export async function revokeInviteCodeAction(codeId: number) {
  const t = await getTranslations("invites");
  const userId = await requireHost();
  if (!userId) return { success: false as const, error: t("errorNotHost") };

  try {
    const remaining = await db.transaction(async (tx) => {
      // Only the creator can revoke, and only while the code is still active.
      const [revoked] = await tx
        .update(inviteCodes)
        .set({ status: "revoked" })
        .where(and(eq(inviteCodes.id, codeId), eq(inviteCodes.creatorId, userId), eq(inviteCodes.status, "active")))
        .returning({ id: inviteCodes.id });
      if (!revoked) return null;

      const [row] = await tx
        .update(users)
        .set({ inviteQuota: sql`${users.inviteQuota} + 1` })
        .where(eq(users.id, userId))
        .returning({ remaining: users.inviteQuota });
      return row?.remaining ?? 0;
    });

    if (remaining === null) return { success: false as const, error: t("errorRevokeNotActive") };
    return { success: true as const, remaining };
  } catch (err: unknown) {
    return { success: false as const, error: err instanceof Error ? err.message : t("errorUnknown") };
  }
}

// ============================================================
// Public registration
// ============================================================

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().max(30),
  password: z.string().min(8).max(72),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
}

export async function registerAction(formData: FormData) {
  const t = await getTranslations("register");

  // Global toggle — admin can close registration entirely.
  const config = await getInviteConfig();
  if (!config.registrationEnabled) return { success: false as const, error: t("errorDisabled") };

  // Per-IP throttle (10 failures / hour) so invite codes can't be probed.
  const ip = await clientIp();
  const rateKey = `register:${ip}`;
  if (isLocked(rateKey, 10)) return { success: false as const, error: t("errorRateLimit") };

  const code = normalizeInviteCode((formData.get("code") as string) ?? "");
  const parsed = registerSchema.safeParse({
    username: ((formData.get("username") as string) ?? "").trim(),
    displayName: ((formData.get("displayName") as string) ?? "").trim(),
    password: (formData.get("password") as string) ?? "",
  });

  if (!code) {
    recordFailure(rateKey, 60 * 60 * 1000);
    return { success: false as const, error: t("errorInvalidCode") };
  }
  if (!parsed.success) return { success: false as const, error: t("errorInvalidFields") };
  const { username, password } = parsed.data;
  const displayName = parsed.data.displayName || username;

  try {
    const outcome = await db.transaction(async (tx) => {
      await sweepExpiredInvites(tx);

      // One code, one account: only a single concurrent request can win this
      // `active → used` transition. Losers see 0 rows and fail cleanly.
      const [claimed] = await tx
        .update(inviteCodes)
        .set({ status: "used", usedAt: sql`NOW()` })
        .where(and(eq(inviteCodes.code, code), eq(inviteCodes.status, "active"), sql`${inviteCodes.expiresAt} > NOW()`))
        .returning({ id: inviteCodes.id });
      if (!claimed) return "bad_code" as const;

      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.username, username));
      // Rolling back releases the code claim automatically.
      if (existing) return "username_taken" as const;

      const passwordHash = await bcrypt.hash(password, 10);
      const [created] = await tx
        .insert(users)
        // inviteQuota 0: players don't generate codes (promotion to host re-grants it).
        .values({ username, passwordHash, displayName, role: "player", inviteQuota: 0 })
        .returning({ id: users.id });

      await tx.update(inviteCodes).set({ usedByUserId: created.id }).where(eq(inviteCodes.id, claimed.id));
      return "ok" as const;
    });

    if (outcome === "bad_code") {
      // Deliberately vague (invalid vs expired vs used) to hinder probing.
      recordFailure(rateKey, 60 * 60 * 1000);
      return { success: false as const, error: t("errorInvalidCode") };
    }
    if (outcome === "username_taken") return { success: false as const, error: t("errorUsernameTaken") };
    return { success: true as const };
  } catch (err: unknown) {
    // Unique-index race on username lands here; report it as taken.
    const msg = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(msg)) return { success: false as const, error: t("errorUsernameTaken") };
    return { success: false as const, error: t("errorUnknown") };
  }
}
