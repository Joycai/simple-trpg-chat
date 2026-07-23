"use server";

import { db } from "@/db";
import { notebookNotes } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { checkRoomAccess } from "@/lib/auth-helpers";
import {
  NOTEBOOK_CATEGORIES,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
  type NotebookCategory,
} from "@/lib/notebook";

/**
 * Notebook (记事本) actions. Notes are strictly private: every query is scoped
 * by the authenticated user's id AND the room id, so no action can ever read
 * or touch another member's notes — the host included. No SSE broadcasts:
 * nothing here is visible to anyone else, and the panel refetches on open.
 */

interface NoteInput {
  title: string;
  content: string;
  category: NotebookCategory;
}

function validateNoteInput({ title, content, category }: NoteInput) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Title is required");
  if (trimmedTitle.length > NOTE_TITLE_MAX) throw new Error("Title too long");
  if (content.length > NOTE_CONTENT_MAX) throw new Error("Content too long");
  if (!NOTEBOOK_CATEGORIES.includes(category)) throw new Error("Invalid category");
  return { title: trimmedTitle, content, category };
}

/** All of the caller's notes in this room, most recently edited first. */
export async function getMyNotesAction(roomId: number) {
  const { userId } = await checkRoomAccess(roomId, false);
  return db
    .select()
    .from(notebookNotes)
    .where(and(eq(notebookNotes.roomId, roomId), eq(notebookNotes.userId, userId)))
    .orderBy(desc(notebookNotes.updatedAt));
}

export async function createNoteAction(roomId: number, input: NoteInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateNoteInput(input);
  const [note] = await db
    .insert(notebookNotes)
    .values({ roomId, userId, ...valid })
    .returning();
  return note;
}

export async function updateNoteAction(roomId: number, noteId: number, input: NoteInput) {
  const { userId } = await checkRoomAccess(roomId, false, { requireWritable: true });
  const valid = validateNoteInput(input);
  const [note] = await db
    .update(notebookNotes)
    .set({ ...valid, updatedAt: new Date().toISOString() })
    .where(and(
      eq(notebookNotes.id, noteId),
      eq(notebookNotes.roomId, roomId),
      eq(notebookNotes.userId, userId),
    ))
    .returning();
  if (!note) throw new Error("Note not found");
  return note;
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
