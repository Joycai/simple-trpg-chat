/**
 * Serialized room-member DTO shared by the server (SSR payload + live
 * `member_joined` event) and the client roster type.
 *
 * Deliberately dependency-free and free of `server-only`: both sides import
 * it, and `src/lib` must not reach into `@/components` (ESLint rule R4).
 */
export interface RoomMemberEntry {
  users?: {
    id?: number;
    isBot?: boolean;
    displayName?: string;
    username?: string;
    botConfigJson?: string | null;
  };
  room_members?: {
    id?: number;
    roomId?: number;
    userId?: number;
    nickname?: string;
    avatarColor?: string | null;
    avatar?: string | null;
    characterData?: string | null;
    joinedAt?: string;
  };
}
