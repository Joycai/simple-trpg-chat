import { parseSheetOrNull, serializeSheet } from "./sheet-store";

/**
 * Plan the one-time upgrade of stored sheets to v2 (`pnpm db:migrate-sheets`).
 * Pure: takes the rows, returns what to write and a report — the script only
 * reads and applies. Reading already upgrades on the fly (`parseSheet`), so
 * the backfill is about leaving no pre-v2 rows behind, not correctness.
 */
export interface BackfillRow {
  memberId: number;
  roomId: number;
  userId: number;
  roomRule: string | null;
  characterData: string | null;
}

export interface BackfillPlan {
  /** `from` is the row as read: the write only lands if it is still that. */
  updates: Array<{ memberId: number; from: string; characterData: string }>;
  report: {
    total: number;
    empty: number;
    alreadyV2: number;
    upgraded: number;
    /** Upgraded rows whose sheet rule differs from the room's (rebuild pending). */
    ruleMismatch: number;
    /** Rows that can't be read (bad JSON, no rule) — left untouched. */
    unreadable: Array<{ memberId: number; roomId: number; userId: number }>;
    /** Upgraded sheets over the size cap — left untouched. */
    tooLarge: Array<{ memberId: number; roomId: number; userId: number }>;
    byRule: Record<string, number>;
  };
}

function isV2(raw: string): boolean {
  try {
    const o = JSON.parse(raw);
    return !!o && typeof o === "object" && o.schemaVersion === 2;
  } catch {
    return false;
  }
}

export function planSheetBackfill(rows: ReadonlyArray<BackfillRow>): BackfillPlan {
  const plan: BackfillPlan = {
    updates: [],
    report: { total: rows.length, empty: 0, alreadyV2: 0, upgraded: 0, ruleMismatch: 0, unreadable: [], tooLarge: [], byRule: {} },
  };
  const { report } = plan;
  for (const row of rows) {
    const where = { memberId: row.memberId, roomId: row.roomId, userId: row.userId };
    if (!row.characterData) { report.empty += 1; continue; }
    if (isV2(row.characterData)) { report.alreadyV2 += 1; continue; }
    const sheet = parseSheetOrNull(row.characterData, row.roomRule ?? undefined);
    if (!sheet) { report.unreadable.push(where); continue; }
    const json = serializeSheet(sheet);
    if (json === null) { report.tooLarge.push(where); continue; }
    plan.updates.push({ memberId: row.memberId, from: row.characterData, characterData: json });
    report.upgraded += 1;
    report.byRule[sheet.ruleTemplate] = (report.byRule[sheet.ruleTemplate] ?? 0) + 1;
    if (row.roomRule && sheet.ruleTemplate !== row.roomRule) report.ruleMismatch += 1;
  }
  return plan;
}
