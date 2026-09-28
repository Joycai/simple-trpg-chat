"use server";

import { db } from "@/db";
import { roomMembers, rooms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import type { CharacterData, SheetEdit } from "@/lib/character/types";
import { rebuildSheetForRule } from "@/lib/character/sheet";
import { applySheetEdit, sanitizeSheetEdit } from "@/lib/character/sheet-model";
import { parseSheet, parseSheetOrNull, serializeSheet } from "@/lib/character/sheet-store";
import { emptySheet } from "@/lib/character/sheet-v2";
import { resolveSheetWriter } from "@/lib/auth/sheet-access";
import { getRule, getRuleForRoom } from "@/lib/rules";
import { getTranslations } from "next-intl/server";
import type { Fail } from "@/lib/actions/result";

async function fail(key: string): Promise<Fail> {
  return { success: false, error: (await getTranslations("character"))(key) };
}

type Membership = { ok: true; userId: number } | { ok: false; key: string };

/** Verify that a user is a member of a room.
 *  Rejects writes when the room is frozen (read-only) unless the caller is the host.
 *  Unlike `tryRoomAccess`, keeps the reason: signed out / not a member / frozen. */
async function checkMembership(roomId: number): Promise<Membership> {
  const session = await auth();
  if (!session) return { ok: false, key: "errorNotAuthenticated" };
  const userId = parseInt(session.user.id);

  const [member] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!member) return { ok: false, key: "errorNotMember" };

  const [room] = await db.select({ frozen: rooms.frozen, hostId: rooms.hostId })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  if (room?.frozen && room.hostId !== userId) {
    return { ok: false, key: "errorRoomFrozen" };
  }

  return { ok: true, userId };
}

/** Read actions still throw — their callers render a retry state. */
async function requireMembership(roomId: number): Promise<number> {
  const m = await checkMembership(roomId);
  if (!m.ok) throw new Error(`Character access denied (${m.key})`);
  return m.userId;
}

async function writeSheet(roomId: number, userId: number, json: string) {
  await db.update(roomMembers)
    .set({ characterData: json })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));
}

/** Result of the on-entry sheet/rule reconciliation. */
export type SheetRuleStatus =
  | { status: "ok" }
  | { status: "initialized"; data: CharacterData }
  | { status: "mismatch"; sheetRule: string; roomRule: string };

/**
 * Reconcile the caller's character sheet with the room's active rule, called
 * when a member enters the room (and again whenever the host switches rules).
 *
 * - no usable sheet yet → store an empty sheet for the room's rule
 * - sheet built for a different rule → report only; the player decides whether
 *   to rebuild (see `rebuildCharacterForRoomRuleAction`)
 *
 * Never throws for non-members / observers / frozen rooms — those just get
 * `ok` so the client can stay silent.
 */
export async function ensureCharacterSheetAction(roomId: number): Promise<SheetRuleStatus> {
  const session = await auth();
  if (!session) return { status: "ok" };
  const userId = parseInt(session.user.id);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));
  if (!member) return { status: "ok" }; // observer / not a member

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { status: "ok" };
  // Frozen rooms are read-only for everyone but the host — don't write, don't nag.
  if (room.frozen && room.hostId !== userId) return { status: "ok" };

  const rule = getRuleForRoom(room);
  const sheet = parseSheetOrNull(member.characterData, rule.id);

  if (!sheet) {
    const data = emptySheet(rule.id);
    await writeSheet(roomId, userId, JSON.stringify(data));
    await broadcastCharacterUpdate(roomId, userId, { sheet: data, by: userId });
    revalidatePath(`/rooms/${roomId}`);
    return { status: "initialized", data };
  }

  if (sheet.ruleTemplate !== rule.id) {
    return { status: "mismatch", sheetRule: sheet.ruleTemplate, roomRule: rule.id };
  }

  return { status: "ok" };
}

/**
 * Rebuild the caller's sheet for the room's current rule, keeping the generic
 * profile fields (see `CARRYOVER_KEYS`). Invoked only after the player accepts
 * the rule-change prompt.
 */
export async function rebuildCharacterForRoomRuleAction(roomId: number): Promise<{ success: true; data: CharacterData } | Fail> {
  const m = await checkMembership(roomId);
  if (!m.ok) return fail(m.key);
  const { userId } = m;

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rule = getRuleForRoom(room || {});
  // Read under the sheet's own rule: its profile fields are what carries over.
  const prev = parseSheetOrNull(member?.characterData);
  const rebuilt = rebuildSheetForRule(prev, rule.id);

  await writeSheet(roomId, userId, JSON.stringify(rebuilt));
  await broadcastCharacterUpdate(roomId, userId, { sheet: rebuilt, by: userId });
  revalidatePath(`/rooms/${roomId}`);
  return { success: true, data: rebuilt };
}

/**
 * Get character data for a user in a room, upgraded to the v2 shape.
 * Null when the member has no sheet (or is not a member).
 */
export async function getCharacterDataAction(roomId: number, targetUserId?: number): Promise<CharacterData | null> {
  const callerId = await requireMembership(roomId);
  const userId = targetUserId || callerId;

  const [row] = await db.select({ characterData: roomMembers.characterData, ruleTemplate: rooms.ruleTemplate })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!row) return null;
  return parseSheetOrNull(row.characterData, row.ruleTemplate ?? undefined);
}

/**
 * The single write action for a character sheet: attributes, resources
 * (current and editable max), profile and custom attributes. The member edits
 * their own card; the room host or an admin may edit any member's (bots
 * included). The edit is validated and clamped by the rule's schema through
 * `applySheetEdit`; only the fields it names change, so a stale client can't
 * roll back values it didn't touch.
 */
export async function editCharacterAction(
  roomId: number,
  targetUserId: number,
  edit: SheetEdit,
): Promise<{ success: true; data: CharacterData } | Fail> {
  const clean = sanitizeSheetEdit(edit);
  if (!clean) return fail("errorInvalidEdit");
  const w = await resolveSheetWriter(roomId, targetUserId);
  if (!w.ok) return fail(w.key);

  const roomRule = getRuleForRoom(w.room);
  const sheet = parseSheet(w.targetSheet, roomRule.id);
  // The sheet's own rule owns its fields (mid rule switch it may differ from
  // the room's until the member rebuilds).
  const next = applySheetEdit(getRule(sheet.ruleTemplate), sheet, clean).sheet;

  const json = serializeSheet(next);
  if (json === null) return fail("errorDataTooLarge");
  await writeSheet(roomId, targetUserId, json);

  await broadcastCharacterUpdate(roomId, targetUserId, { sheet: next, by: w.callerId });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true, data: next };
}
