/** Command Execution Result */
export interface CommandResult {
  success: boolean;
  message?: unknown;
  error?: string;
  isCommand: boolean;
  /** Machine-readable failure code for callers that branch on the reason (e.g. STAT_NOT_SET). */
  code?: string;
}

/**
 * Channel context in which a command was issued.
 * Used to keep command feedback inside the channel it came from:
 * - public channel → results broadcast to everyone
 * - private channel (isPrivate + targetUserId) → results only the DM pair sees
 */
export interface CommandContext {
  isPrivate?: boolean;
  targetUserId?: number;
  /**
   * Host-side proxy roll: the command runs as `userId` (the absent player), but
   * `proxiedBy` carries the host so the resulting dice bubble can render a
   * "代投 by <host>" chip and stay transparent about who actually clicked.
   */
  proxiedBy?: { userId: number; nickname: string };
  /** The issuing browser tab's id (`tabId()`), bound to the caller in `character_updated`'s origin. */
  origin?: string;
}
