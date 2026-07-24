"use server";

import { db } from "@/db";
import { notebookCategories, notebookNotes, roomMembers, users } from "@/db/schema";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
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
 *
 * Mutations return `{ success, error }` result objects with the message already
 * localized server-side (same convention as background.ts / invite.ts). They
 * used to throw bare English `Error`s, which Next.js redacts in production —
 * the client's `err.message` then showed "An error occurred in the Server
 * Components render…" to a player who had merely hit the category limit.
 * Reads still throw; their callers render a retry state.
 */

type Fail = { success: false; error: string };
type NotebookMessages = Awaited<ReturnType<typeof getNotebookMessages>>;

function getNotebookMessages() {
  return getTranslations("notebook");
}

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

/** Wraps checkRoomAccess (which throws, and is shared) into a result value. */
async function requireWritableMember(roomId: number): Promise<{ userId: number } | null> {
  try {
    const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
    return { userId };
  } catch {
    return null;
  }
}

function validateNoteInput({ title, content }: NoteInput, t: NotebookMessages) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: t("errorTitleRequired") };
  if (trimmedTitle.length > NOTE_TITLE_MAX) return { error: t("errorTitleTooLong", { max: NOTE_TITLE_MAX }) };
  if (content.length > NOTE_CONTENT_MAX) return { error: t("errorContentTooLong", { max: NOTE_CONTENT_MAX }) };
  return { value: { title: trimmedTitle, content } };
}

function validateCategoryInput({ name, color }: CategoryInput, t: NotebookMessages) {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: t("errorCategoryNameRequired") };
  if (trimmedName.length > CATEGORY_NAME_MAX) return { error: t("errorCategoryNameTooLong", { max: CATEGORY_NAME_MAX }) };
  if (!NOTEBOOK_COLORS.includes(color)) return { error: t("errorInvalidColor") };
  return { value: { name: trimmedName, color } };
}

/** A note may only point at one of the caller's own categories in this room. */
async function ownsCategory(roomId: number, userId: number, categoryId: number | null) {
  if (categoryId === null) return true;
  const [cat] = await db
    .select({ id: notebookCategories.id })
    .from(notebookCategories)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, userId),
    ));
  return !!cat;
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
    const t = await getNotebookMessages();
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
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const valid = validateCategoryInput(input, t);
  if (!valid.value) return { success: false as const, error: valid.error } satisfies Fail;

  const [category] = await db
    .insert(notebookCategories)
    .values({ roomId, userId: auth.userId, ...valid.value })
    .onConflictDoNothing()
    .returning();
  if (!category) return { success: false as const, error: t("errorCategoryNameExists") } satisfies Fail;

  // Enforce the cap *after* inserting and roll back if it was exceeded. A
  // count-then-insert can be raced by two concurrent creates, both of which
  // read a count below the limit and then both insert.
  const all = await db
    .select({ id: notebookCategories.id })
    .from(notebookCategories)
    .where(and(eq(notebookCategories.roomId, roomId), eq(notebookCategories.userId, auth.userId)));
  if (all.length > CATEGORY_MAX_COUNT) {
    await db.delete(notebookCategories).where(eq(notebookCategories.id, category.id));
    return { success: false as const, error: t("errorTooManyCategories", { max: CATEGORY_MAX_COUNT }) } satisfies Fail;
  }

  return { success: true as const, category };
}

export async function updateCategoryAction(roomId: number, categoryId: number, input: CategoryInput) {
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const valid = validateCategoryInput(input, t);
  if (!valid.value) return { success: false as const, error: valid.error } satisfies Fail;

  const [category] = await db
    .update(notebookCategories)
    .set(valid.value)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, auth.userId),
    ))
    .returning();
  if (!category) return { success: false as const, error: t("errorCategoryNotFound") } satisfies Fail;
  return { success: true as const, category };
}

/** Deleting a category drops its notes into "uncategorized" (FK set null). */
export async function deleteCategoryAction(roomId: number, categoryId: number) {
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const [deleted] = await db
    .delete(notebookCategories)
    .where(and(
      eq(notebookCategories.id, categoryId),
      eq(notebookCategories.roomId, roomId),
      eq(notebookCategories.userId, auth.userId),
    ))
    .returning({ id: notebookCategories.id });
  if (!deleted) return { success: false as const, error: t("errorCategoryNotFound") } satisfies Fail;
  return { success: true as const };
}

export async function createNoteAction(roomId: number, input: NoteInput) {
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const valid = validateNoteInput(input, t);
  if (!valid.value) return { success: false as const, error: valid.error } satisfies Fail;
  if (!(await ownsCategory(roomId, auth.userId, input.categoryId))) {
    return { success: false as const, error: t("errorCategoryNotFound") } satisfies Fail;
  }

  const [note] = await db
    .insert(notebookNotes)
    .values({ roomId, userId: auth.userId, categoryId: input.categoryId, ...valid.value })
    .returning();
  return { success: true as const, note };
}

export async function updateNoteAction(roomId: number, noteId: number, input: NoteInput) {
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const valid = validateNoteInput(input, t);
  if (!valid.value) return { success: false as const, error: valid.error } satisfies Fail;
  if (!(await ownsCategory(roomId, auth.userId, input.categoryId))) {
    return { success: false as const, error: t("errorCategoryNotFound") } satisfies Fail;
  }

  const [note] = await db
    .update(notebookNotes)
    // sql`now()` — the DB clock, matching the column default used by insert and
    // by shareNoteAction. Stamping with the app clock here meant one table
    // carried two clocks, and getMyNotebookAction orders by this column.
    .set({ ...valid.value, categoryId: input.categoryId, updatedAt: sql`now()` })
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, auth.userId),
    ))
    .returning();
  if (!note) return { success: false as const, error: t("errorNoteNotFound") } satisfies Fail;
  return { success: true as const, note };
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
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const targets = Array.from(new Set(targetUserIds)).filter((id) => id !== auth.userId);
  if (targets.length === 0) return { success: false as const, error: t("errorNoRecipients") } satisfies Fail;

  const [note] = await db
    .select({ title: notebookNotes.title, content: notebookNotes.content })
    .from(notebookNotes)
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, auth.userId),
    ));
  if (!note) return { success: false as const, error: t("errorNoteNotFound") } satisfies Fail;

  // Only human members of this room may receive a copy. The bot exclusion was
  // client-side only (NotebookShareModal), so a crafted call could plant notes
  // in a bot's notebook — same join/filter as event.ts's roomAudienceIds.
  const members = await db
    .select({ userId: roomMembers.userId, isBot: users.isBot })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targets)));
  const validIds = members.filter((m) => !m.isBot).map((m) => m.userId);
  if (validIds.length === 0) return { success: false as const, error: t("errorNoRecipients") } satisfies Fail;

  const [sender] = await db
    .select({ name: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, auth.userId));
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

  return { success: true as const, count: validIds.length };
}

export async function deleteNoteAction(roomId: number, noteId: number) {
  const t = await getNotebookMessages();
  const auth = await requireWritableMember(roomId);
  if (!auth) return { success: false as const, error: t("errorUnauthorized") } satisfies Fail;

  const [deleted] = await db
    .delete(notebookNotes)
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, auth.userId),
    ))
    .returning({ id: notebookNotes.id });
  if (!deleted) return { success: false as const, error: t("errorNoteNotFound") } satisfies Fail;
  return { success: true as const };
}
