"use server";

import { db } from "@/db";
import { notebookCategories, notebookNotes, roomMembers, users } from "@/db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { checkRoomAccess } from "@/lib/auth-helpers";
import {
  NOTEBOOK_COLORS,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
  CATEGORY_NAME_MAX,
  CATEGORY_MAX_COUNT,
  type NotebookColor,
} from "@/lib/notebook";

/**
 * Notebook (记事本) actions. Notes AND categories are strictly private: every
 * query is scoped by the authenticated user's id AND the room id, so no action
 * can ever read or touch another member's notebook — the host included. No SSE
 * broadcasts: nothing here is visible to anyone else, and the panel refetches
 * on open.
 */

interface NoteInput {
  title: string;
  content: string;
  /** One of the caller's own categories, or null = uncategorized. */
  categoryId: number | null;
}

interface CategoryInput {
  name: string;
  color: NotebookColor;
}

function validateNoteInput({ title, content }: NoteInput) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Title is required");
  if (trimmedTitle.length > NOTE_TITLE_MAX) throw new Error("Title too long");
  if (content.length > NOTE_CONTENT_MAX) throw new Error("Content too long");
  return { title: trimmedTitle, content };
}

function validateCategoryInput({ name, color }: CategoryInput) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Category name is required");
  if (trimmedName.length > CATEGORY_NAME_MAX) throw new Error("Category name too long");
  if (!NOTEBOOK_COLORS.includes(color)) throw new Error("Invalid color");
  return { name: trimmedName, color };
}

/** A note may only point at one of the caller's own categories in this room. */
async function assertOwnCategory(roomId: number, userId: number, categoryId: number | null) {
  if (categoryId === null) return;
  const [cat] = await db
    .select({ id: notebookCategories.id })
    .from(notebookCategories)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, userId),
    ));
  if (!cat) throw new Error("Category not found");
}

/**
 * The caller's whole notebook in this room: categories (seeding the 4
 * localized defaults on first open) + notes, notes most recently edited first.
 */
export async function getMyNotebookAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);

  const scope = and(eq(notebookCategories.roomId, roomId), eq(notebookCategories.userId, userId));
  let categories = await db.select().from(notebookCategories).where(scope).orderBy(asc(notebookCategories.id));

  if (categories.length === 0) {
    const t = await getTranslations("notebook");
    const defaults: Array<{ name: string; color: NotebookColor }> = [
      { name: t("catClue"), color: "accent" },
      { name: t("catRelation"), color: "primary" },
      { name: t("catTimeline"), color: "ai" },
      { name: t("catMisc"), color: "neutral" },
    ];
    // The (roomId,userId,name) unique constraint dedupes concurrent first opens.
    await db
      .insert(notebookCategories)
      .values(defaults.map((d) => ({ roomId, userId, ...d })))
      .onConflictDoNothing();
    categories = await db.select().from(notebookCategories).where(scope).orderBy(asc(notebookCategories.id));
  }

  const notes = await db
    .select()
    .from(notebookNotes)
    .where(and(eq(notebookNotes.roomId, roomId), eq(notebookNotes.userId, userId)))
    .orderBy(desc(notebookNotes.updatedAt));

  return { categories, notes };
}

export async function createCategoryAction(roomId: number, input: CategoryInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateCategoryInput(input);
  const existing = await db
    .select({ id: notebookCategories.id })
    .from(notebookCategories)
    .where(and(eq(notebookCategories.roomId, roomId), eq(notebookCategories.userId, userId)));
  if (existing.length >= CATEGORY_MAX_COUNT) throw new Error("Too many categories");
  const [category] = await db
    .insert(notebookCategories)
    .values({ roomId, userId, ...valid })
    .onConflictDoNothing()
    .returning();
  if (!category) throw new Error("Category name already exists");
  return category;
}

export async function updateCategoryAction(roomId: number, categoryId: number, input: CategoryInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateCategoryInput(input);
  const [category] = await db
    .update(notebookCategories)
    .set(valid)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, userId),
    ))
    .returning();
  if (!category) throw new Error("Category not found");
  return category;
}

/** Deleting a category drops its notes into "uncategorized" (FK set null). */
export async function deleteCategoryAction(roomId: number, categoryId: number) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const [deleted] = await db
    .delete(notebookCategories)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, userId),
    ))
    .returning({ id: notebookCategories.id });
  if (!deleted) throw new Error("Category not found");
  return { success: true as const };
}

export async function createNoteAction(roomId: number, input: NoteInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateNoteInput(input);
  await assertOwnCategory(roomId, userId, input.categoryId);
  const [note] = await db
    .insert(notebookNotes)
    .values({ roomId, userId, categoryId: input.categoryId, ...valid })
    .returning();
  return note;
}

export async function updateNoteAction(roomId: number, noteId: number, input: NoteInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateNoteInput(input);
  await assertOwnCategory(roomId, userId, input.categoryId);
  const [note] = await db
    .update(notebookNotes)
    .set({ ...valid, categoryId: input.categoryId, updatedAt: new Date().toISOString() })
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, userId),
    ))
    .returning();
  if (!note) throw new Error("Note not found");
  return note;
}

/**
 * Share (send a COPY of) one of the caller's notes to other room members.
 * Each recipient gets an independent notebook_notes row in their own scope —
 * uncategorized, tagged with the sender's display-name snapshot (sourceName).
 * The copy is decoupled: later edits to the original never propagate, and its
 * @-mentions resolve against the *recipient's* backpack at render time, so any
 * entry the recipient doesn't hold silently degrades to plain text.
 *
 * No SSE — like the rest of the notebook, the recipient sees the copy on their
 * next open. Returns how many copies were created.
 */
export async function shareNoteAction(roomId: number, noteId: number, targetUserIds: number[]) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });

  const targets = Array.from(new Set(targetUserIds)).filter((id) => id !== userId);
  if (targets.length === 0) throw new Error("No recipients");

  const [note] = await db
    .select({ title: notebookNotes.title, content: notebookNotes.content })
    .from(notebookNotes)
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, userId),
    ));
  if (!note) throw new Error("Note not found");

  // Only members of this room may receive a copy.
  const members = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targets)));
  const validIds = members.map((m) => m.userId);
  if (validIds.length === 0) throw new Error("No valid recipients");

  const [sender] = await db
    .select({ name: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  const sourceName = sender?.name || sender?.username || "";

  await db.insert(notebookNotes).values(
    validIds.map((rid) => ({
      roomId,
      userId: rid,
      categoryId: null,
      title: note.title,
      content: note.content,
      sourceName,
    })),
  );

  return { count: validIds.length };
}

export async function deleteNoteAction(roomId: number, noteId: number) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const [deleted] = await db
    .delete(notebookNotes)
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, userId),
    ))
    .returning({ id: notebookNotes.id });
  if (!deleted) throw new Error("Note not found");
  return { success: true as const };
}
