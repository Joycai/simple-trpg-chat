import { getBotStatus } from "@/lib/ai/bot-status";
import { primaryVital, type StatusEntry } from "@/lib/rules";
import { parseSheetOrNull } from "@/lib/character/sheet-store";

/**
 * Pure derivations over the room roster for the chat UI: who can be mentioned
 * or DMed, the DM list with its badges, the badge total, and the top bar's
 * member / bot / online counts. RoomClient calls them during render (memoizing
 * the costlier ones); they live here so they can be tested without React.
 */

type RosterUser = { id?: number; isBot?: boolean; botConfigJson?: string | null; displayName?: string };

/** A member row as the room page delivers it — relation keys vary by call site. */
export interface RosterEntry {
  users?: RosterUser;
  user?: RosterUser;
  user_id?: number;
  room_members?: { nickname?: string; characterData?: string | null; avatar?: string | null; avatarColor?: string | null };
}

export interface RoomMentionTarget {
  id: number;
  nickname: string;
  isBot: boolean;
  isBotDisabled: boolean;
  isProviderError: boolean;
  vital: StatusEntry | null;
  avatar: string | null;
  avatarColor: string | null;
}

export interface RoomDmConversation {
  userId: number;
  nickname: string;
  isBot: boolean;
  unread: number;
  isBotDisabled: boolean;
  isProviderError: boolean;
  isOnline: boolean;
  vital: StatusEntry | null;
  avatar: string | null;
  avatarColor: string | null;
}

/** Players and bots other than the viewer, with bot availability and the primary vital. */
export function buildMentionTargets(
  players: RosterEntry[],
  userId: number,
  aiEnabled: boolean,
  validProviderIds: number[],
  /** The room's rule — settles pre-v2 rows that carry two rules' bags. */
  roomRuleId?: string,
): RoomMentionTarget[] {
  return players
    .filter((p) => (p.users?.id || p.user_id) !== userId)
    .map((p) => {
      const u = p.users || p.user;
      const { isBotDisabled, isProviderError } = getBotStatus(u, aiEnabled, validProviderIds);
      // Rows may still be pre-v2 (upgraded on read) or unparsable (no vital).
      const charData = parseSheetOrNull(p.room_members?.characterData, roomRuleId);
      return {
        id: (u?.id || p.user_id) ?? 0,
        nickname: p.room_members?.nickname || u?.displayName || `#${u?.id || p.user_id}`,
        isBot: !!u?.isBot,
        isBotDisabled,
        isProviderError,
        vital: primaryVital(charData),
        avatar: p.room_members?.avatar ?? null,
        avatarColor: p.room_members?.avatarColor ?? null,
      };
    });
}

/** One DM entry per mention target: unread badge, presence, and the live vital
 *  pushed over SSE when there is one. */
export function buildDmConversations(
  targets: RoomMentionTarget[],
  unreadCounts: Record<number, number>,
  onlineUserIds: Set<number>,
  liveVitals: Map<number, StatusEntry>,
): RoomDmConversation[] {
  return targets.map((p) => ({
    userId: p.id,
    nickname: p.nickname,
    isBot: p.isBot,
    unread: unreadCounts[p.id] || 0,
    isBotDisabled: p.isBotDisabled,
    isProviderError: p.isProviderError,
    isOnline: onlineUserIds.has(p.id),
    vital: liveVitals.get(p.id) ?? p.vital,
    avatar: p.avatar,
    avatarColor: p.avatarColor,
  }));
}

/** Sum of all DM unread counts (the top-bar badge). */
export function totalUnread(unreadCounts: Record<number, number>): number {
  return Object.values(unreadCounts).reduce((a, b) => a + b, 0);
}

/** Bots and non-bot members on the roster (the top bar's counts). Reads
 *  `users.isBot` only, as the top bar always has. */
export function countRoster(players: RosterEntry[]): { botCount: number; playerCount: number } {
  const botCount = players.filter((p) => p.users?.isBot).length;
  return { botCount, playerCount: players.length - botCount };
}

/**
 * Live "online" count: non-bot members with an active SSE connection, plus
 * the viewer (always online to themselves). Shared by the top bar and the
 * roster panel so their "X 在线" labels agree — presence comes from SSE
 * `presence_update`, not the roster.
 */
export function countOnline(players: RosterEntry[], userId: number, onlineUserIds: Set<number>): number {
  return players.filter((p) => {
    const u = p.users || p.user;
    const id = u?.id ?? p.user_id;
    return !u?.isBot && (id === userId || onlineUserIds.has(id ?? -1));
  }).length;
}
