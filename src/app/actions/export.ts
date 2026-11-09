"use server";

import { parseSheetOrNull } from "@/lib/character/sheet-store";
import { sheetSnapshot, type SheetSnapshot } from "@/lib/character/sheet-export";
import { db } from "@/db";
import { messages, roomMembers, rooms } from "@/db/schema";
import { eq, asc, and, gt } from "drizzle-orm";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { getTranslations } from "next-intl/server";
import { getRule, getRuleForRoom } from "@/lib/rules";
import { messageVisibilityWhere } from "@/lib/messaging/router";
import { partitionExportMessages, type ExportTimelineItem } from "@/lib/format/export-timeline";

interface ExportCharacterSnapshot extends SheetSnapshot {
  nickname: string;
  userId: number;
}

interface ExportRoomData {
  roomName: string;
  /** Raw rule id, kept for machine consumers of the JSON export. */
  ruleTemplate: string;
  /** Translated rule name for the human-readable markdown export. */
  ruleTemplateLabel: string;
  theme: string;
  exportTime: string;
  timeline: ExportTimelineItem[];
  privateConversations: Record<string, ExportTimelineItem[]>;
  characterSnapshots: ExportCharacterSnapshot[];
}

/**
 * E1: Query all room data and assemble structured export data.
 *
 * Visibility is NOT re-invented here: the WHERE clause is the same
 * `messageVisibilityWhere` the room page and every history query use, and the
 * per-row classification is `canSee`. Export must never widen what a host can
 * read in the live UI (other players' self-rolls, recipient-only notices), nor
 * drop a DM the host is actually part of.
 */
async function loadExportData(roomId: number): Promise<ExportRoomData> {
  const access = await checkRoomAccess(roomId, true);
  const hostId = access.userId;
  const isHostViewer = access.isHost; // true for the host and for admins

  // Room info
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) throw new Error("Room not found");

  // Members for nickname lookup
  const members = await db.select().from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  const memberMap = new Map(members.map(m => [m.userId, m]));

  // Build timeline by streaming message chunks — never accumulate all messages in memory
  const timeline: ExportTimelineItem[] = [];
  const privateMap: Record<string, ExportTimelineItem[]> = {};
  const nicknameFor = (uid: number) => memberMap.get(uid)?.nickname;

  const chunkSize = 5000;
  let lastId = 0;
  let hasMore = true;

  while (hasMore) {
    const chunk = await db.select().from(messages)
      .where(and(
        messageVisibilityWhere(roomId, hostId, isHostViewer),
        gt(messages.id, lastId),
      ))
      .orderBy(asc(messages.id))
      .limit(chunkSize);

    if (chunk.length === 0) {
      hasMore = false;
    } else {
      // Same partition rule the unit test pins: `canSee` per row, host-involved
      // dm/directed rows grouped by pair, everything else on the public timeline.
      const partitioned = partitionExportMessages(chunk, hostId, isHostViewer, nicknameFor);
      timeline.push(...partitioned.timeline);
      for (const [key, items] of Object.entries(partitioned.privateConversations)) {
        (privateMap[key] ??= []).push(...items);
      }

      lastId = chunk[chunk.length - 1].id;
      if (chunk.length < chunkSize) {
        hasMore = false;
      }
    }
  }

  // Character snapshots — built from each sheet's rule schema, so adding a
  // ruleset doesn't require touching the export path. Resource labels are
  // resolved here so the markdown formatter stays rule-agnostic.
  const tChar = await getTranslations("character");
  const snapshots: ExportCharacterSnapshot[] = [];
  const roomRuleId = getRuleForRoom(room).id;
  for (const member of members) {
    const charData = parseSheetOrNull(member.characterData, roomRuleId);
    if (!charData) continue;
    snapshots.push({
      nickname: member.nickname,
      userId: member.userId,
      ...sheetSnapshot(getRule(charData.ruleTemplate), charData, (k) => tChar(k as Parameters<typeof tChar>[0])),
    });
  }

  // The rule names itself — every registered ruleset has a `labelKey` under
  // `messages.export`, asserted by rules.test.ts, so a new ruleset shows its
  // own name here instead of silently falling back to "通用 d100".
  const tExport = await getTranslations("export");
  const roomRule = getRuleForRoom(room as { ruleTemplate?: string | null });

  return {
    roomName: room.name,
    ruleTemplate: (room as { ruleTemplate?: string }).ruleTemplate || "basic",
    ruleTemplateLabel: tExport(roomRule.labelKey as Parameters<typeof tExport>[0]),
    theme: room.theme || "default",
    exportTime: new Date().toISOString(),
    timeline,
    privateConversations: privateMap,
    characterSnapshots: snapshots,
  };
}

/**
 * Build downloadable export as a single action.
 * Returns { markdown, json } strings.
 */
export async function buildExportAction(roomId: number) {
  const data = await loadExportData(roomId);
  const t = await getTranslations("export");
  const { formatAsMarkdown, formatAsJson } = await import("@/lib/format/export");
  return {
    roomName: data.roomName,
    markdown: formatAsMarkdown(data, (key, vals) => t(key as Parameters<typeof t>[0], vals)),
    json: formatAsJson(data),
  };
}
