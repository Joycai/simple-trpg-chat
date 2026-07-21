"use server";

import { db } from "@/db";
import { roomMembers, rooms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { broadcastToRoom } from "@/lib/events";
import {
  type CharacterData,
  type CocAttributes,
  type D20Sheet,
  type ShSheet,
  type CustomAttribute,
  COC_DEFAULT_ATTRIBUTES,
  SH_DEFAULT_ATTRIBUTES,
  computeCocDerived,
  computeShDerived,
} from "@/lib/character-types";
import { rebuildSheetForRule } from "@/lib/character-sheet";
import { getRule, getRuleForRoom, primaryVital } from "@/lib/rules";

/** Verify that a user is a member of a room. Returns userId on success.
 *  Rejects writes when the room is frozen (read-only) unless the caller is the host. */
async function requireMembership(roomId: number): Promise<number> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt(session.user.id);

  const [member] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!member) throw new Error("Not a member of this room");

  const [room] = await db.select({ frozen: rooms.frozen, hostId: rooms.hostId })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  if (room?.frozen && room.hostId !== userId) {
    throw new Error("Room is frozen (read-only)");
  }

  return userId;
}

/**
 * Initialize a fresh character sheet for the current user, shaped by the
 * room's active rule (COC: 9 attrs + derived; d20: 8 attrs + HP; basic: {}).
 * Delegates entirely to `rule.initCharacter()` — the action just persists.
 */
export async function initCharacterAction(roomId: number) {
  const userId = await requireMembership(roomId);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rule = getRuleForRoom(room || {});
  const characterData = rule.initCharacter();

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(characterData) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return characterData;
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
 * - no sheet yet (or unparsable / rule-less) → seed `rule.initCharacter()`
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

  let sheet: CharacterData | null = null;
  if (member.characterData) {
    try {
      sheet = JSON.parse(member.characterData) as CharacterData;
    } catch {
      sheet = null;
    }
  }

  if (!sheet?.ruleTemplate) {
    const data = rule.initCharacter();
    await db.update(roomMembers)
      .set({ characterData: JSON.stringify(data) })
      .where(and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId)
      ));
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
export async function rebuildCharacterForRoomRuleAction(roomId: number): Promise<CharacterData> {
  const userId = await requireMembership(roomId);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  let prev: CharacterData | null = null;
  if (member?.characterData) {
    try {
      prev = JSON.parse(member.characterData) as CharacterData;
    } catch {
      prev = null;
    }
  }

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rebuilt = rebuildSheetForRule(prev, getRuleForRoom(room || {}).initCharacter());

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(rebuilt) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return rebuilt;
}

/**
 * Back-compat shim — CharacterPanel previously called this directly. New code
 * should call `initCharacterAction` instead; this exists so any in-flight
 * code paths still resolve. Internally delegates to the rule-driven version.
 */
export async function initCocCharacterAction(roomId: number) {
  return initCharacterAction(roomId);
}

/**
 * Save character data (attributes, resources, custom fields).
 * Handles COC 7th derived value recomputation.
 */
export async function saveCharacterDataAction(
  roomId: number,
  data: Partial<CharacterData>
) {
  const userId = await requireMembership(roomId);

  // Get existing data
  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  const existing: CharacterData = member?.characterData
    ? JSON.parse(member.characterData)
    : { ruleTemplate: "basic" };

  let merged: CharacterData = { ...existing, ...data };

  // Recompute derived values through the rule module — COC re-derives hp/san/
  // mp + preserves player-set currents; d20 clamps hp_current to hpMax; basic
  // is identity. Removes the need for a rule-id branch here.
  merged = getRule(merged.ruleTemplate).computeDerived(merged);

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(merged) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return merged;
}

/**
 * Update COC attributes and auto-recompute derived values.
 */
export async function updateCocAttributesAction(
  roomId: number,
  attrs: Partial<CocAttributes>
) {
  const userId = await requireMembership(roomId);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  const existing: CharacterData = member?.characterData
    ? JSON.parse(member.characterData)
    : { ruleTemplate: "coc7th", cocAttributes: { ...COC_DEFAULT_ATTRIBUTES } };

  existing.cocAttributes = { ...(existing.cocAttributes || COC_DEFAULT_ATTRIBUTES), ...attrs };
  existing.ruleTemplate = existing.ruleTemplate || "coc7th";
  const prevSan = existing.cocDerived?.san;
  existing.cocDerived = computeCocDerived(existing.cocAttributes);
  if (prevSan !== undefined) {
    existing.cocDerived.san = Math.min(prevSan, existing.cocDerived.sanMax);
  }

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(existing) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return existing;
}

/**
 * Add a custom attribute (for non-COC systems or extensions).
 */
export async function addCustomAttributeAction(
  roomId: number,
  attr: CustomAttribute
) {
  const userId = await requireMembership(roomId);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  const existing: CharacterData = member?.characterData
    ? JSON.parse(member.characterData)
    : { ruleTemplate: "basic" };

  const customAttrs = existing.customAttributes || [];
  const idx = customAttrs.findIndex(a => a.name === attr.name);
  if (idx >= 0) {
    customAttrs[idx] = attr;
  } else {
    customAttrs.push(attr);
  }

  existing.customAttributes = customAttrs;

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(existing) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return existing;
}

/**
 * Remove a custom attribute by name.
 */
export async function removeCustomAttributeAction(
  roomId: number,
  attrName: string
) {
  const userId = await requireMembership(roomId);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  const existing: CharacterData = member?.characterData
    ? JSON.parse(member.characterData)
    : { ruleTemplate: "basic" };

  existing.customAttributes = (existing.customAttributes || []).filter(a => a.name !== attrName);

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(existing) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return existing;
}

/**
 * Get character data for a user in a room.
 */
export async function getCharacterDataAction(roomId: number, targetUserId?: number) {
  const callerId = await requireMembership(roomId);

  const userId = targetUserId || callerId;

  // If requesting another user's data, verify they are also a member of this room
  if (targetUserId && targetUserId !== callerId) {
    const [targetMember] = await db.select({ id: roomMembers.id })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, targetUserId)));
    if (!targetMember) return null;
  }

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!member?.characterData) return null;
  return JSON.parse(member.characterData) as CharacterData;
}

/**
 * Update resource current values (HP, SAN, MP).
 * Allows the resource owner to update, or the room host/admin to update any player's resources.
 */
export async function updateResourcesAction(
  roomId: number,
  targetUserId: number,
  resources: {
    hp_current?: number;
    san_current?: number;
    mp_current?: number;
    // d20-only fields — applied to d20Sheet when the active rule is dnd5e.
    hpMax?: number;
    // 狩魂者-only field — applied to shSheet when the active rule is shouhun.
    mana_current?: number;
  }
) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt(session.user.id);
  const callerRole = session.user.role;

  // Check membership
  const [caller] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, callerId)
    ));
  if (!caller) throw new Error("Not a member of this room");

  // Check authorization: must be owner, room host, or admin
  const [room] = await db.select({ hostId: rooms.hostId, frozen: rooms.frozen })
    .from(rooms)
    .where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");

  const isOwner = callerId === targetUserId;
  const isHost = callerId === room.hostId;
  const isAdmin = callerRole === "admin";

  if (!isOwner && !isHost && !isAdmin) {
    throw new Error("Unauthorized to update this character's resources");
  }

  // Frozen rooms are read-only for non-hosts
  if (room.frozen && !isHost && !isAdmin) {
    throw new Error("Room is frozen (read-only)");
  }

  // Verify target user is a member
  const [targetMember] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, targetUserId)
    ));
  if (!targetMember) throw new Error("Target user is not a member of this room");

  const charData: CharacterData = targetMember.characterData
    ? JSON.parse(targetMember.characterData)
    : { ruleTemplate: "basic" };

  if (charData.ruleTemplate === "dnd5e") {
    // d20: HP lives on d20Sheet (current + max are both editable here).
    const meta: D20Sheet = { ...(charData.d20Sheet ?? {}) };
    if (resources.hpMax !== undefined) {
      meta.hpMax = Math.max(0, resources.hpMax);
    }
    if (resources.hp_current !== undefined) {
      const cap = typeof meta.hpMax === "number" ? meta.hpMax : resources.hp_current;
      meta.hp_current = Math.max(0, Math.min(resources.hp_current, cap));
      if (typeof meta.hpMax !== "number") meta.hpMax = meta.hp_current;
    }
    charData.d20Sheet = meta;
  } else if (charData.ruleTemplate === "shouhun") {
    // 狩魂者: only currents persist on shSheet; maxes derive from attributes.
    const derived = computeShDerived(charData.shAttributes ?? SH_DEFAULT_ATTRIBUTES);
    const meta: ShSheet = { ...(charData.shSheet ?? {}) };
    if (resources.hp_current !== undefined) {
      meta.hp_current = Math.max(0, Math.min(resources.hp_current, derived.hpMax));
    }
    if (resources.mana_current !== undefined) {
      meta.mana_current = Math.max(0, Math.min(resources.mana_current, derived.manaMax));
    }
    charData.shSheet = meta;
  } else {
    // COC / basic: HP/SAN/MP on cocDerived.
    if (!charData.cocDerived) {
      charData.cocDerived = { hp: 0, hpMax: 0, san: 0, sanMax: 0, mp: 0, mpMax: 0, mov: 0, db: "0", build: 0, luck: 0 };
    }
    if (resources.hp_current !== undefined) {
      charData.cocDerived.hp_current = Math.max(0, Math.min(resources.hp_current, charData.cocDerived.hpMax));
    }
    if (resources.san_current !== undefined) {
      charData.cocDerived.san_current = Math.max(0, Math.min(resources.san_current, charData.cocDerived.sanMax));
    }
    if (resources.mp_current !== undefined) {
      charData.cocDerived.mp_current = Math.max(0, Math.min(resources.mp_current, charData.cocDerived.mpMax));
    }
  }

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(charData) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, targetUserId)
    ));

  // The member list shows whatever the rule calls this character's primary
  // vital (HP where it exists, else the first resource/custom attribute), so
  // broadcast that entry rather than an HP pair only COC-likes can fill.
  broadcastToRoom(roomId, {
    type: "character_updated",
    userId: targetUserId,
    vital: primaryVital(charData),
  });

  revalidatePath(`/rooms/${roomId}`);
  return charData;
}
