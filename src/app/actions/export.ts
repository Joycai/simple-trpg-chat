"use server";

import { db } from "@/db";
import { messages, roomMembers, rooms, users } from "@/db/schema";
import { eq, asc, and, gt } from "drizzle-orm";
import { auth } from "@/auth";
import { checkRoomAccess } from "@/lib/auth-helpers";
import { getTranslations } from "next-intl/server";

interface ExportTimelineItem {
  time: string;
  type: "message" | "dice" | "check_request" | "system" | "clue" | "status" | "image";
  nickname?: string;
  userId?: number;
  content?: string;
  diceDetail?: string;
  isPrivate?: boolean;
  targetUserId?: number | null;
  targetNickname?: string;
}

interface ExportCharacterSnapshot {
  nickname: string;
  userId: number;
  hp?: number;
  hpMax?: number;
  san?: number;
  mp?: number;
  attributes?: Record<string, number>;
  skills?: { name: string; value: number }[];
}

interface ExportRoomData {
  roomName: string;
  ruleTemplate: string;
  diceRules: string;
  theme: string;
  exportTime: string;
  timeline: ExportTimelineItem[];
  privateConversations: Record<string, ExportTimelineItem[]>;
  characterSnapshots: ExportCharacterSnapshot[];
}

/**
 * E1: Query all room data and assemble structured export data.
 */
export async function exportRoomDataAction(roomId: number): Promise<ExportRoomData> {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

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

  const chunkSize = 5000;
  let lastId = 0;
  let hasMore = true;

  while (hasMore) {
    const chunk = await db.select().from(messages)
      .where(and(eq(messages.roomId, roomId), gt(messages.id, lastId)))
      .orderBy(asc(messages.id))
      .limit(chunkSize);

    if (chunk.length === 0) {
      hasMore = false;
    } else {
      for (const msg of chunk) {
        const item: ExportTimelineItem = {
          time: msg.createdAt,
          type: msg.type as ExportTimelineItem["type"],
          nickname: msg.nickname,
          userId: msg.userId,
          content: msg.content,
          isPrivate: msg.isPrivate,
          targetUserId: msg.targetUserId,
        };

        if (msg.diceDetail) {
          item.diceDetail = msg.diceDetail;
        }

        if (msg.isPrivate && msg.targetUserId) {
          // Exclude player-to-player whispers — only include host-sent private messages
          if (msg.userId !== hostId) {
            continue;
          }
          // Group private messages by conversation pair
          const pair = [Math.min(msg.userId, msg.targetUserId), Math.max(msg.userId, msg.targetUserId)];
          const key = pair.join("-");
          if (!privateMap[key]) privateMap[key] = [];
          const targetMember = memberMap.get(msg.targetUserId);
          item.targetNickname = targetMember?.nickname || `#${msg.targetUserId}`;
          privateMap[key].push(item);
        } else {
          timeline.push(item);
        }
      }

      lastId = chunk[chunk.length - 1].id;
      if (chunk.length < chunkSize) {
        hasMore = false;
      }
    }
  }

  // Character snapshots
  const snapshots: ExportCharacterSnapshot[] = [];
  for (const member of members) {
    if (!member.characterData) continue;
    try {
      const charData = JSON.parse(member.characterData);
      const snapshot: ExportCharacterSnapshot = {
        nickname: member.nickname,
        userId: member.userId,
      };
      if (charData.cocDerived) {
        snapshot.hp = charData.cocDerived.hp;
        snapshot.hpMax = charData.cocDerived.hpMax;
        snapshot.san = charData.cocDerived.san;
        snapshot.mp = charData.cocDerived.mp;
      }
      if (charData.cocAttributes) {
        snapshot.attributes = charData.cocAttributes;
      }
      snapshots.push(snapshot);
    } catch { /* skip */ }
  }

  return {
    roomName: room.name,
    ruleTemplate: (room as any).ruleTemplate || "basic",
    diceRules: room.diceRules || "basic",
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
  const data = await exportRoomDataAction(roomId);
  const t = await getTranslations("export");
  const { formatAsMarkdown, formatAsJson } = await import("@/lib/export-formatter");
  return {
    roomName: data.roomName,
    markdown: formatAsMarkdown(data, (key, vals) => t(key as any, vals)),
    json: formatAsJson(data),
  };
}
