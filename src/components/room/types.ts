import type { ThemeId, StoredThemeMode, ResolvedMode } from "@/themes/types";
import type { Audience } from "@/lib/messaging/audience";

export interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
  frozen?: boolean;
  theme: string;
  themeMode?: string;
  ruleTemplate?: string;
  createdAt?: string;
}

export interface Message {
  id: number;
  roomId: number;
  userId: number;
  targetUserId?: number | null;
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "clue" | "check_request" | "image" | "sticker";
  systemKind?: "st" | "error" | "room-event" | "scene-marker" | "help" | "inventory-dispatch" | "inventory-receipt" | "timeline-divider" | null;
  diceDetail: string | null;
  audience: Audience;
  isPrivate: boolean;
  createdAt: string;
}

export type ConnectionStatus = "connecting" | "connected" | "error";

export type CheckMode = "check" | "psychology" | "sancheck";

export interface PendingSkillCheck {
  messageId: number;
  skillName: string;
}

// A mention/check target (player or bot, excluding self) derived from the
// room's player list.
export interface MentionTarget {
  id: number;
  nickname: string;
  isBot: boolean;
  isBotDisabled: boolean;
  isProviderError: boolean;
}

// Bots currently "typing" in the room, keyed by bot user id. `isPrivate`/`targetUserId`
// distinguish a public think-indicator from one inside a specific DM channel.
export type TypingBots = Record<number, { nickname: string; typing: boolean; isPrivate?: boolean; targetUserId?: number }>;

// Loose shape for a room member as delivered by the server query. The relation
// keys vary (`users`/`user`/`user_id`) depending on the call site, so every
// access path stays optional.
export type PlayerEntry = {
  users?: { id?: number; isBot?: boolean; displayName?: string; username?: string; botConfigJson?: string | null };
  user?: { id?: number; isBot?: boolean };
  user_id?: number;
  room_members?: { nickname?: string; avatarColor?: string | null; avatar?: string | null; characterData?: string | null };
  nickname?: string;
};

export interface RoomClientProps {
  room: Room;
  messages: Message[];
  userId: number;
  isHost: boolean;
  currentNickname: string;
  roomTheme?: ThemeId;
  roomThemeMode?: StoredThemeMode;
  /** Concrete light/dark resolved server-side from the latest divider (themeMode="timeline"). */
  initialTimelineMode?: ResolvedMode;
  players?: PlayerEntry[];
  characterData?: string | null;
  aiEnabled?: boolean;
  validProviderIds?: number[];
  userName: string;
  userRole: string;
  /** Active room background URL (null = background off) — see RoomBackground. */
  backgroundUrl?: string | null;
  /** Admin viewing a room they haven't joined: read-only, not in member list. */
  isObserver?: boolean;
}
