/**
 * One-time dedup for `room_members` (run BEFORE `pnpm db:push` adds the
 * unique(room_id, user_id) constraint).
 *
 * Historically there was no unique constraint, so a race in the join flow could
 * leave a user with more than one membership row in the same room. This collapses
 * each (room_id, user_id) group to a single row, keeping the one that actually
 * holds character data (then the lowest id as a tiebreak) and deleting the rest.
 *
 * Idempotent: groups with a single row are untouched, so it is safe to re-run.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";

async function main() {
  const result = await db.execute(sql`
    DELETE FROM room_members rm
    USING (
      SELECT room_id, user_id,
        (ARRAY_AGG(id ORDER BY (character_data IS NOT NULL) DESC, id ASC))[1] AS keep_id
      FROM room_members
      GROUP BY room_id, user_id
      HAVING COUNT(*) > 1
    ) dups
    WHERE rm.room_id = dups.room_id
      AND rm.user_id = dups.user_id
      AND rm.id <> dups.keep_id
  `);

  const count = Array.isArray(result) ? result.length : (result as { count?: number }).count ?? "?";
  console.log(`[dedup-room-members] Removed duplicate memberships (${count}). Now run: pnpm db:push`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[dedup-room-members] Failed:", err);
  process.exit(1);
});
