export interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isBanned: boolean;
  aiPoints: number;
  /** Remaining invite-code generations (meaningful for hosts only). */
  inviteQuota: number;
  createdAt: string;
}

export type PointsMode = "add" | "subtract" | "set";

export type RoleFilter = "all" | "admin" | "host" | "player" | "banned";
