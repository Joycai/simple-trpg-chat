/** A room member the host can grant an event to. */
export interface EventPlayer {
  id: number;
  nickname: string;
  isBot: boolean;
  isOnline?: boolean;
  avatarColor?: string | null;
}
