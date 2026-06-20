/**
 * Central message-visibility model.
 *
 * Every message declares a single `audience` describing WHO may see it. All
 * delivery/visibility decisions across the app (SSE push, server-side history
 * queries, client tab routing, DM unread counts) derive from these pure helpers
 * — there is no scattered `isPrivate`/`type` sniffing anymore.
 *
 * This file is intentionally dependency-free so it can be imported by both the
 * server (Server Actions, SSE route) and the client (RoomClient).
 *
 *  - everyone : public channel — every room member sees it.
 *  - self     : only the actor (e.g. .st / .help / .rh feedback).
 *  - directed : the actor + one targeted user, rendered inline in the public
 *               feed (a NOTICE, not a DM): psychology notify, item/clue receipts.
 *  - dm       : a 1:1 private conversation between the actor and `targetUserId`.
 *  - gm       : the actor + the room host (GM-private rolls, host-only summaries).
 */
export const AUDIENCES = ["everyone", "self", "directed", "dm", "gm"] as const;

export type Audience = (typeof AUDIENCES)[number];

/** The minimal message shape the visibility helpers need. */
export interface AudienceFields {
  userId: number; // the actor (sender)
  targetUserId?: number | null; // the directed user / DM partner (dm + directed only)
  audience: Audience;
}

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}

/** Whether `viewerId` is allowed to receive/see this message. */
export function canSee(m: AudienceFields, viewerId: number, viewerIsHost: boolean): boolean {
  switch (m.audience) {
    case "everyone":
      return true;
    case "self":
      return viewerId === m.userId;
    case "directed":
    case "dm":
      return viewerId === m.userId || viewerId === m.targetUserId;
    case "gm":
      return viewerId === m.userId || viewerIsHost;
    default:
      return false;
  }
}

/**
 * The DM partner of a `dm` message from `viewerId`'s perspective, or null for any
 * non-DM message. Used to bucket a message into the correct DM conversation.
 */
export function dmPartner(m: AudienceFields, viewerId: number): number | null {
  if (m.audience !== "dm") return null;
  if (m.userId === viewerId) return m.targetUserId ?? null;
  if (m.targetUserId === viewerId) return m.userId;
  return null;
}

/**
 * Which channel/tab this message belongs to for `viewerId`:
 *  - "public" : the public feed (everyone/self/directed/gm all render inline here)
 *  - <number> : the userId of the DM partner (dm messages)
 */
export function channelOf(m: AudienceFields, viewerId: number): "public" | number {
  const partner = dmPartner(m, viewerId);
  return partner ?? "public";
}

/**
 * Whether this message should bump `viewerId`'s unread badge for a DM partner.
 * Only genuine inbound DM turns count — never the viewer's own messages, and
 * never inline notices (directed/self/gm) which have their own indicators.
 */
export function countsAsDmUnread(m: AudienceFields, viewerId: number): boolean {
  return m.audience === "dm" && m.targetUserId === viewerId && m.userId !== viewerId;
}
