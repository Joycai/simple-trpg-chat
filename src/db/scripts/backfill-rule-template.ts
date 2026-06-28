/**
 * One-off backfill: lift any non-basic value from the legacy `dice_rules`
 * column into `rule_template` for rooms where `rule_template` is still
 * `basic`. After this runs, `rule_template` is the single source of truth
 * and `dice_rules` can be safely dropped via `pnpm db:push`.
 *
 * Usage (run BEFORE `pnpm db:push` drops the column):
 *   pnpm tsx src/db/scripts/backfill-rule-template.ts
 *
 * Idempotent — safe to re-run. Reports counts so ops can spot-check.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  // Use raw SQL because the schema no longer declares the `dice_rules`
  // column — Drizzle's typed query builder wouldn't expose it anymore.
  // The `postgres` driver returns a RowList (array-like), so we index directly.
  const before = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
      FROM rooms
     WHERE rule_template = 'basic'
       AND dice_rules <> 'basic'
  `);
  const candidates = before[0]?.n ?? 0;
  console.log(`[backfill] candidates needing lift: ${candidates}`);

  if (candidates === 0) {
    console.log("[backfill] nothing to do");
    return;
  }

  await db.execute(sql`
    UPDATE rooms
       SET rule_template = dice_rules
     WHERE rule_template = 'basic'
       AND dice_rules <> 'basic'
  `);

  const after = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
      FROM rooms
     WHERE rule_template = 'basic'
       AND dice_rules <> 'basic'
  `);
  const remaining = after[0]?.n ?? 0;
  console.log(`[backfill] lifted ${candidates - remaining} rooms; remaining mismatched: ${remaining}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  });
