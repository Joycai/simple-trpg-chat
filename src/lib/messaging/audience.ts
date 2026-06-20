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
 *  - everyone  : public channel — every room member sees it.
 *  - self      : only the actor (e.g. .st / .help / .rh feedback).
 *  - recipient : ONLY the targeted user, NOT the actor — an inline notice meant for
 *                one person (psychology notify, item/clue "you received…" receipts).
 *  - directed  : the actor + one targeted user, rendered inline in the public feed
 *                (host + recipient both see the content, e.g. a pushed clue card).
 *  - dm        : a 1:1 private conversation between the actor and `targetUserId`.
 *  - gm        : the actor + the room host (GM-private rolls, host-only summaries).
 */
export const AUDIENCES = ["everyone", "self", "recipient", "directed", "dm", "gm"] as const;

export type Audience = (typeof AUDIENCES)[number];

/** The minimal message shape the visibility helpers need. */
export interface AudienceFields {
  userId: number; // the actor (sender)
  targetUserId?: number | null; // WHO: the directed user (dm / directed / recipient)
  audience: Audience;
  channelUserId?: number | null; // WHERE: null = public feed; else the DM partner (with userId)
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
    case "recipient":
      // A notice for the target alone — the actor (e.g. the host who triggered it)
      // does NOT see it; they get their own result/summary separately.
      return viewerId === m.targetUserId;
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
 * Which channel/tab this message belongs to for `viewerId` — driven solely by
 * `channelUserId` (WHERE), independent of the audience (WHO):
 *  - "public" : channelUserId is null — renders in the public feed.
 *  - <number> : the message belongs to the DM between `userId` and `channelUserId`;
 *               return the other end from the viewer's perspective.
 *
 * This keeps an audience-restricted message (a hidden roll = `self`, a psychology
 * notify = `recipient`) inside the DM it was issued in, while `canSee` still limits
 * who actually receives it.
 */
export function channelOf(m: AudienceFields, viewerId: number): "public" | number {
  if (m.channelUserId == null) return "public";
  return viewerId === m.userId ? m.channelUserId : m.userId;
}

/**
 * Whether this message should bump `viewerId`'s unread badge for a DM partner.
 * Only genuine inbound DM turns count — never the viewer's own messages, and
 * never inline notices (recipient/directed/self/gm) which have their own indicators.
 */
export function countsAsDmUnread(m: AudienceFields, viewerId: number): boolean {
  return m.audience === "dm" && m.targetUserId === viewerId && m.userId !== viewerId;
}
