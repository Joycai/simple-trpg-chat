import { canSee } from "@/lib/messaging/audience";
import type { Audience } from "@/lib/messaging/audience";

/** The subset of a `messages` row the export partition needs. */
export interface ExportMessageRow {
  id: number;
  userId: number;
  targetUserId: number | null;
  nickname: string;
  type: string;
  content: string;
  audience: Audience;
  diceDetail: string | null;
  createdAt: string;
}

export interface ExportTimelineItem {
  time: string;
  type: string;
  nickname?: string;
  userId?: number;
  content?: string;
  diceDetail?: string;
  isPrivate?: boolean;
  targetUserId?: number | null;
  targetNickname?: string;
}

/**
 * Split a room's messages into the public timeline and host-involved private
 * conversations.
 *
 * Two layers intentionally guard the same rule:
 * - the SQL side (`messageVisibilityWhere`) decides which rows are fetched;
 * - this pure function re-applies `canSee` per row, so a future caller that
 *   forgets the predicate — or a stale materialized cache — still cannot leak
 *   another player's `self` hidden roll or a `recipient`-only notice.
 *
 * `dm`/`directed` rows are the only ones tied to a second participant, so they
 * become a per-pair conversation. Everything else (public chat, the host's own
 * self/gm output) stays on the timeline in id order.
 */
export function partitionExportMessages(
  rows: readonly ExportMessageRow[],
  viewerId: number,
  viewerIsHost: boolean,
  nicknameFor: (userId: number) => string | undefined,
): { timeline: ExportTimelineItem[]; privateConversations: Record<string, ExportTimelineItem[]> } {
  const timeline: ExportTimelineItem[] = [];
  const privateConversations: Record<string, ExportTimelineItem[]> = {};

  for (const msg of rows) {
    const view = { userId: msg.userId, targetUserId: msg.targetUserId, audience: msg.audience };
    if (!canSee(view, viewerId, viewerIsHost)) continue;

    const item: ExportTimelineItem = {
      time: msg.createdAt,
      type: msg.type,
      nickname: msg.nickname,
      userId: msg.userId,
      content: msg.content,
      isPrivate: msg.audience !== "everyone",
      targetUserId: msg.targetUserId,
      ...(msg.diceDetail ? { diceDetail: msg.diceDetail } : {}),
    };

    if ((msg.audience === "dm" || msg.audience === "directed") && msg.targetUserId != null) {
      const pair = [Math.min(msg.userId, msg.targetUserId), Math.max(msg.userId, msg.targetUserId)];
      const key = pair.join("-");
      (privateConversations[key] ??= []).push({
        ...item,
        targetNickname: nicknameFor(msg.targetUserId) || `#${msg.targetUserId}`,
      });
    } else {
      timeline.push(item);
    }
  }

  return { timeline, privateConversations };
}
