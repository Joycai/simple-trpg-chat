import "server-only";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { serializeSheet } from "./sheet-store";
import type { CharacterData } from "./types";

/** What a step decides for the locked row: the sheet to store (or none), plus a result for the caller. */
export interface SheetRowStep<R> {
  /** The sheet to write back; omit to leave the row as it is. */
  sheet?: CharacterData;
  result: R;
}

export type SheetRowOutcome<R> =
  /** `sheet` is what was written, or null when the step wrote nothing. */
  | { status: "ok"; result: R; sheet: CharacterData | null }
  | { status: "notMember" }
  | { status: "tooLarge"; result: R };

/**
 * Read-modify-write one member's `character_data` under a row lock.
 *
 * Every sheet writer (the edit action, the rebuild, `.st`, `.sc`, the AI tool)
 * reads the row, applies its edit in memory and stores the whole JSON. Without
 * the lock, two writers overlapping on one sheet — the host ticking HP in the
 * overview while the player runs `.st` — would each start from the same row and
 * the later write would revert the earlier one's field. `SELECT … FOR UPDATE`
 * makes the second writer wait and start from the first one's result.
 *
 * `step` gets the raw column value (parse it with the room rule) and must stay
 * synchronous and free of other I/O: it runs while the row is locked.
 */
export async function updateSheetRow<R>(
  roomId: number,
  userId: number,
  step: (raw: string | null) => SheetRowStep<R>,
): Promise<SheetRowOutcome<R>> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: roomMembers.id, characterData: roomMembers.characterData })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId)))
      .for("update");
    if (!row) return { status: "notMember" } as const;

    const { sheet, result } = step(row.characterData);
    if (!sheet) return { status: "ok", result, sheet: null } as const;
    const json = serializeSheet(sheet);
    if (json === null) return { status: "tooLarge", result } as const;
    await tx.update(roomMembers).set({ characterData: json }).where(eq(roomMembers.id, row.id));
    return { status: "ok", result, sheet } as const;
  });
}
