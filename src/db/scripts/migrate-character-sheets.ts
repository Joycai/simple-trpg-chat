/**
 * One-time upgrade of stored character sheets to the v2 shape
 * (`pnpm db:migrate-sheets`, add `--apply` to write, `--room <id>` to limit
 * it to one room).
 *
 * The app already reads pre-v2 rows and upgrades them on read, and every
 * write stores v2 — so this is housekeeping: it leaves no old rows behind.
 * Dry run by default: prints what it would do. Idempotent: v2 rows are
 * skipped, so it is safe to re-run. Unreadable or oversized rows are
 * reported and left untouched. Safe while the app runs: each row is only
 * replaced if it still holds what was read, so a sheet written meanwhile
 * (already v2) is kept and reported.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { roomMembers, rooms } from "../schema";
import { planSheetBackfill } from "@/lib/character/backfill";

async function main() {
  const apply = process.argv.includes("--apply");
  const roomArg = process.argv.indexOf("--room");
  const roomId = roomArg >= 0 ? parseInt(process.argv[roomArg + 1], 10) : undefined;
  if (roomArg >= 0 && !Number.isInteger(roomId)) {
    console.error("[migrate-sheets] --room needs a room id");
    process.exit(1);
  }
  const query = db
    .select({
      memberId: roomMembers.id,
      roomId: roomMembers.roomId,
      userId: roomMembers.userId,
      roomRule: rooms.ruleTemplate,
      characterData: roomMembers.characterData,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId));
  const rows = roomId === undefined ? await query : await query.where(eq(roomMembers.roomId, roomId));

  const { updates, report } = planSheetBackfill(rows);
  console.log(`[migrate-sheets] ${apply ? "APPLY" : "dry run"}${roomId !== undefined ? ` (room ${roomId})` : ""} — ${report.total} member rows`);
  console.log(`  already v2: ${report.alreadyV2}, empty: ${report.empty}, to upgrade: ${report.upgraded}`);
  for (const [rule, n] of Object.entries(report.byRule)) console.log(`    ${rule}: ${n}`);
  if (report.ruleMismatch) console.log(`  built for another rule than the room's (rebuild prompt pending): ${report.ruleMismatch}`);
  for (const r of report.unreadable) console.log(`  unreadable, left as is: member ${r.memberId} (room ${r.roomId}, user ${r.userId})`);
  for (const r of report.tooLarge) console.log(`  over the size cap, left as is: member ${r.memberId} (room ${r.roomId}, user ${r.userId})`);

  if (!apply) {
    console.log("[migrate-sheets] Nothing written. Re-run with --apply to upgrade.");
    process.exit(0);
  }
  const skipped = await db.transaction(async (tx) => {
    const changedMeanwhile: number[] = [];
    for (const u of updates) {
      const done = await tx.update(roomMembers)
        .set({ characterData: u.characterData })
        .where(and(eq(roomMembers.id, u.memberId), eq(roomMembers.characterData, u.from)))
        .returning({ id: roomMembers.id });
      if (done.length === 0) changedMeanwhile.push(u.memberId);
    }
    return changedMeanwhile;
  });
  for (const id of skipped) console.log(`  written by the app meanwhile, left as is: member ${id}`);
  console.log(`[migrate-sheets] Upgraded ${updates.length - skipped.length} sheets.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate-sheets] Failed:", err);
  process.exit(1);
});
