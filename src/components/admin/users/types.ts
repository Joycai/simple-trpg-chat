export interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isBanned: boolean;
  aiPoints: number;
  createdAt: string;
}

export type PointsMode = "add" | "subtract" | "set";

export type RoleFilter = "all" | "admin" | "host" | "player" | "banned";
