"use server";

import { db } from "@/db";
import { roomMembers, rooms, roomSkills, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { broadcastCharacterUpdate } from "@/lib/character/broadcast";
import type { CharacterData, SheetEdit } from "@/lib/character/types";
import { rebuildSheetForRule } from "@/lib/character/sheet";
import { applySheetEdit, sanitizeSheetEdit } from "@/lib/character/sheet-model";
import { parseSheet, parseSheetOrNull } from "@/lib/character/sheet-store";
import { updateSheetRow } from "@/lib/character/sheet-row";
import { emptySheet } from "@/lib/character/sheet-v2";
import { resolveSheetWriter } from "@/lib/auth/sheet-access";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { memberCompletionSummary } from "@/lib/character/member-completion";
import type { CompletionSummary } from "@/lib/character/completion";
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
export async function ensureCharacterSheetAction(roomId: number, origin?: string): Promise<SheetRuleStatus> {
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
    // Re-checked under the lock: another writer may have stored one meanwhile.
    const out = await updateSheetRow(roomId, userId, (raw) =>
      parseSheetOrNull(raw, rule.id) ? { result: null } : { sheet: emptySheet(rule.id), result: null });
    if (out.status !== "ok" || !out.sheet) return { status: "ok" };
    await broadcastCharacterUpdate(roomId, userId, { by: userId, tab: origin });
    revalidatePath(`/rooms/${roomId}`);
    return { status: "initialized", data: out.sheet };
  }

  if (sheet.ruleTemplate !== rule.id) {
    return { status: "mismatch", sheetRule: sheet.ruleTemplate, roomRule: rule.id };
  }

  return { status: "ok" };
}

/**
 * Rebuild a member's sheet for the room's current rule, keeping the generic
 * profile fields (see `CARRYOVER_KEYS`). The member invokes it after accepting
 * the rule-change prompt; the host (or an admin) may rebuild any member's —
 * bots never see that prompt. A sheet already on the room's rule is left
 * as it is, so a repeated click can't wipe it.
 */
export async function rebuildCharacterForRoomRuleAction(
  roomId: number,
  targetUserId: number,
  origin?: string,
): Promise<{ success: true; data: CharacterData } | Fail> {
  const w = await resolveSheetWriter(roomId, targetUserId);
  if (!w.ok) return fail(w.key);
  const rule = getRuleForRoom(w.room);

  const out = await updateSheetRow(roomId, targetUserId, (raw) => {
    // Read under the sheet's own rule: its profile fields are what carries over.
    const prev = parseSheetOrNull(raw);
    if (prev && prev.ruleTemplate === rule.id) return { result: prev };
    const rebuilt = rebuildSheetForRule(prev, rule.id);
    return { sheet: rebuilt, result: rebuilt };
  });
  if (out.status === "notMember") return fail("errorTargetNotMember");
  if (out.status === "tooLarge") return fail("errorDataTooLarge");

  if (out.sheet) {
    await broadcastCharacterUpdate(roomId, targetUserId, { by: w.callerId, tab: origin });
    revalidatePath(`/rooms/${roomId}`);
  }
  // The stored copy carries the new `rev`; an untouched sheet is the stored one.
  return { success: true, data: out.sheet ?? out.result };
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
  /** The calling tab (`tabId()`), so its own `character_updated` echo is skipped. */
  origin?: string,
): Promise<{ success: true; data: CharacterData } | Fail> {
  const clean = sanitizeSheetEdit(edit);
  if (!clean) return fail("errorInvalidEdit");
  const w = await resolveSheetWriter(roomId, targetUserId);
  if (!w.ok) return fail(w.key);

  const roomRule = getRuleForRoom(w.room);
  const out = await updateSheetRow(roomId, targetUserId, (raw) => {
    const sheet = parseSheet(raw, roomRule.id);
    // The sheet's own rule owns its fields (mid rule switch it may differ from
    // the room's until the member rebuilds).
    const next = applySheetEdit(getRule(sheet.ruleTemplate), sheet, clean).sheet;
    return { sheet: next, result: next };
  });
  if (out.status === "notMember") return fail("errorTargetNotMember");
  if (out.status === "tooLarge") return fail("errorDataTooLarge");
  const next = out.sheet ?? out.result;

  await broadcastCharacterUpdate(roomId, targetUserId, { by: w.callerId, tab: origin });

  revalidatePath(`/rooms/${roomId}`);
  return { success: true, data: next };
}

/** One row of the host's character overview. */
export interface HostSheetRow {
  userId: number;
  nickname: string;
  isBot: boolean;
  avatarColor: string | null;
  /** The member's sheet (v2), or null when none is stored. */
  sheet: CharacterData | null;
  /** Required set / total, and the fields still missing. */
  completion: CompletionSummary;
}

/**
 * Every member's sheet and completion for the host's overview (players and
 * bots; the host's own card is left out). Host / admin only — a read action,
 * so it throws on refusal and the panel shows its retry state.
 */
export async function loadHostSheetsAction(roomId: number): Promise<{ ruleId: string; rows: HostSheetRow[] }> {
  await checkRoomAccess(roomId, true);
  const [room] = await db.select({ ruleTemplate: rooms.ruleTemplate, hostId: rooms.hostId }).from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { ruleId: "basic", rows: [] };
  const ruleId = getRuleForRoom(room).id;
  const [members, skills] = await Promise.all([
    db.select({
      userId: roomMembers.userId, nickname: roomMembers.nickname, avatarColor: roomMembers.avatarColor,
      characterData: roomMembers.characterData, isBot: users.isBot,
    }).from(roomMembers).innerJoin(users, eq(users.id, roomMembers.userId)).where(eq(roomMembers.roomId, roomId)),
    db.select({ userId: roomSkills.userId, skillName: roomSkills.skillName }).from(roomSkills).where(eq(roomSkills.roomId, roomId)),
  ]);
  const rows = members
    .filter((m) => m.userId !== room.hostId)
    .map((m) => {
      const sheet = parseSheetOrNull(m.characterData, ruleId);
      return {
        userId: m.userId,
        nickname: m.nickname,
        isBot: !!m.isBot,
        avatarColor: m.avatarColor,
        sheet,
        completion: memberCompletionSummary(sheet, skills.filter((s) => s.userId === m.userId).map((s) => s.skillName), ruleId),
      };
    });
  return { ruleId, rows };
}

