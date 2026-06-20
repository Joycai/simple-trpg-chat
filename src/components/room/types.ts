import type { ThemeId } from "@/themes/types";
import type { Audience } from "@/lib/messaging/audience";

export interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
  frozen?: boolean;
  theme: string;
  diceRules?: string;
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
  type: "text" | "dice" | "system" | "clue" | "check_request" | "image";
  diceDetail: string | null;
  audience: Audience;
  isPrivate: boolean;
  createdAt: string;
}

// Loose shape for a room member as delivered by the server query. The relation
// keys vary (`users`/`user`/`user_id`) depending on the call site, so every
// access path stays optional.
export type PlayerEntry = {
  users?: { id?: number; isBot?: boolean; displayName?: string; username?: string; botConfigJson?: string | null };
  user?: { id?: number; isBot?: boolean };
  user_id?: number;
  room_members?: { nickname?: string; avatarColor?: string | null; avatar?: string | null };
  nickname?: string;
};

export interface RoomClientProps {
  room: Room;
  messages: Message[];
  userId: number;
  isHost: boolean;
  currentNickname: string;
  roomTheme?: ThemeId;
  roomDiceRules?: string;
  players?: PlayerEntry[];
  characterData?: string | null;
  aiEnabled?: boolean;
  validProviderIds?: number[];
  userName: string;
  userRole: string;
}
