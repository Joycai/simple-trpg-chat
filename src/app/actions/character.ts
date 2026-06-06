"use server";

import { db } from "@/db";
import { roomMembers, rooms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import {
  type CharacterData,
  type CocAttributes,
  type CustomAttribute,
  type ResourceBar,
  COC_DEFAULT_ATTRIBUTES,
  computeCocDerived,
} from "@/lib/character-types";

/** Verify that a user is a member of a room. Returns userId on success. */
async function requireMembership(roomId: number): Promise<number> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = parseInt((session.user as any).id);

  const [member] = await db.select({ id: roomMembers.id })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!member) throw new Error("Not a member of this room");
  return userId;
}

/**
 * Initialize COC 7th character sheet for the current user.
 * Sets default attributes + computed derived values.
 */
export async function initCocCharacterAction(roomId: number) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

  const attrs = { ...COC_DEFAULT_ATTRIBUTES };
  const derived = computeCocDerived(attrs);

  const characterData: CharacterData = {
    ruleTemplate: "coc7th",
    cocAttributes: attrs,
    cocDerived: derived,
  };

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(characterData) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  revalidatePath(`/rooms/${roomId}`);
  return characterData;
}

/**
 * Save character data (attributes, resources, custom fields).
 * Handles COC 7th derived value recomputation.
 */
export async function saveCharacterDataAction(
  roomId: number,
  data: Partial<CharacterData>
) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

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

  const merged: CharacterData = { ...existing, ...data };

  // Recompute derived values if COC attributes changed
  if (merged.ruleTemplate === "coc7th" && merged.cocAttributes) {
    merged.cocDerived = computeCocDerived(merged.cocAttributes);
  }

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

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
  existing.ruleTemplate = "coc7th";
  existing.cocDerived = computeCocDerived(existing.cocAttributes);

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = parseInt((session.user as any).id);

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
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const userId = targetUserId || parseInt((session.user as any).id);

  const [member] = await db.select({ characterData: roomMembers.characterData })
    .from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, userId)
    ));

  if (!member?.characterData) return null;
  return JSON.parse(member.characterData) as CharacterData;
}
