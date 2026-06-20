/**
 * One-time backfill for the `messages.audience` column (run AFTER `pnpm db:push`).
 *
 * `db:push` adds `audience` with a default of 'everyone'. That default would make
 * every historical private message public, so this script reconstructs the correct
 * audience for existing rows from the legacy (is_private, target_user_id, type,
 * user_id) fields — mirroring the pre-refactor visibility rules exactly:
 *
 *   public (not private)            → everyone
 *   self-targeted (target = sender) → self      (.st / .rh / warnings / KP psy result)
 *   private, no target              → gm        (host summaries, GM-private rolls)
 *   system notice w/ target         → recipient (psy notify, item/clue receipts — target only)
 *   clue card w/ target             → directed  (pushed clue cards — host + recipient)
 *   otherwise (whisper/check w/ tgt)→ dm
 *
 * This mirrors the pre-refactor SSE rule: a targeted `system` message was delivered
 * to the target ONLY, while a targeted `clue` (or any non-system) reached sender+target.
 *
 * Idempotent: derives only from stable legacy columns, so it is safe to re-run.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";

async function main() {
  const result = await db.execute(sql`
    UPDATE messages SET
      audience = CASE
        WHEN is_private = false                     THEN 'everyone'
        WHEN target_user_id = user_id               THEN 'self'
        WHEN target_user_id IS NULL                 THEN 'gm'
        WHEN type = 'system'                        THEN 'recipient'
        WHEN type = 'clue'                          THEN 'directed'
        ELSE 'dm'
      END,
      -- channel (WHERE it renders): historically only dm whispers lived in a DM tab;
      -- every other private message rendered in the public feed → no channel.
      channel_user_id = CASE
        WHEN is_private = false                     THEN NULL
        WHEN target_user_id IS NULL                 THEN NULL
        WHEN target_user_id = user_id               THEN NULL
        WHEN type IN ('system', 'clue')             THEN NULL
        ELSE target_user_id
      END
  `);

  // postgres-js returns the affected rows; surface a count for visibility.
  const count = Array.isArray(result) ? result.length : (result as { count?: number }).count ?? "?";
  console.log(`[backfill-audience] Updated messages.audience for existing rows (${count}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-audience] Failed:", err);
  process.exit(1);
});
