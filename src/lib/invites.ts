/**
 * Invite-code core: code generation/normalization, the lazy expiry sweep, and
 * systemConfig readers. See docs/design/invite-registration.md.
 */

import crypto from "crypto";
import { db } from "@/db";
import { inviteCodes, systemConfig, users } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

/** Hours before an unused invite code expires (quota is refunded). */
export const INVITE_CODE_TTL_HOURS = 48;

/**
 * 30-symbol alphabet: digits and uppercase letters minus the easily-confused
 * 0/O, 1/I/L and U(V). 12 chars ≈ 59 bits of entropy — not guessable online.
 */
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_CHARS = 12;

/** Generate a fresh code in canonical `XXXX-XXXX-XXXX` form. */
export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(CODE_CHARS);
  let raw = "";
  for (let i = 0; i < CODE_CHARS; i++) {
    raw += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/**
 * Normalize user input to canonical `XXXX-XXXX-XXXX` (uppercase, dashes/spaces
 * ignored). Returns null when the input can't be a valid code.
 */
export function normalizeInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "");
  if (raw.length !== CODE_CHARS) return null;
  for (const ch of raw) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Transaction client type (subset of `db` that `db.transaction` hands us). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lazy expiry sweep: flip overdue `active` codes to `expired` and refund one
 * quota point per code to its creator. The single conditional UPDATE makes the
 * refund exactly-once under concurrency (only the `active → expired` winner
 * rows come back from RETURNING). Call inside a transaction before any read
 * or consumption of invite codes.
 */
export async function sweepExpiredInvites(tx: Tx): Promise<void> {
  const expired = await tx
    .update(inviteCodes)
    .set({ status: "expired" })
    .where(sql`${inviteCodes.status} = 'active' AND ${inviteCodes.expiresAt} < NOW()`)
    .returning({ creatorId: inviteCodes.creatorId });

  if (expired.length === 0) return;

  const refunds = new Map<number, number>();
  for (const row of expired) {
    refunds.set(row.creatorId, (refunds.get(row.creatorId) ?? 0) + 1);
  }
  for (const [creatorId, n] of refunds) {
    await tx
      .update(users)
      .set({ inviteQuota: sql`${users.inviteQuota} + ${n}` })
      .where(eq(users.id, creatorId));
  }
}

// ============================================================
// systemConfig keys
// ============================================================

export const INVITE_CONFIG_KEYS = {
  registrationEnabled: "invite_registration_enabled",
  defaultQuota: "invite_default_quota",
} as const;

export const INVITE_DEFAULT_QUOTA_FALLBACK = 4;

export interface InviteConfig {
  registrationEnabled: boolean;
  defaultQuota: number;
}

/** Clamp an admin-supplied default quota to a sane 0–99 integer. */
export function clampDefaultQuota(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return INVITE_DEFAULT_QUOTA_FALLBACK;
  return Math.min(99, Math.max(0, n));
}

/** Read both invite config keys (uncached — these sit on low-traffic paths). */
export async function getInviteConfig(): Promise<InviteConfig> {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(inArray(systemConfig.key, [INVITE_CONFIG_KEYS.registrationEnabled, INVITE_CONFIG_KEYS.defaultQuota]));
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    // Enabled unless the admin explicitly turned it off.
    registrationEnabled: cfg[INVITE_CONFIG_KEYS.registrationEnabled] !== "0",
    defaultQuota: clampDefaultQuota(cfg[INVITE_CONFIG_KEYS.defaultQuota] ?? INVITE_DEFAULT_QUOTA_FALLBACK),
  };
}
