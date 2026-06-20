import { describe, it, expect } from "vitest";
import { canSee, channelOf, countsAsDmUnread, dmPartner, isAudience } from "../audience";

// Actors used across cases: 5 = host/sender, 8 = the targeted player, 9 = a bystander.
const HOST = 5;
const PLAYER = 8;
const OTHER = 9;

describe("audience — canSee", () => {
  it("everyone: visible to all", () => {
    const m = { userId: HOST, targetUserId: null, audience: "everyone" as const };
    expect(canSee(m, HOST, true)).toBe(true);
    expect(canSee(m, OTHER, false)).toBe(true);
  });

  it("self: only the actor, even for the host", () => {
    const m = { userId: HOST, targetUserId: null, audience: "self" as const };
    expect(canSee(m, HOST, false)).toBe(true);
    expect(canSee(m, OTHER, true)).toBe(false); // host does not get to peek
  });

  it("recipient: ONLY the target — not the actor/host who triggered it", () => {
    // e.g. psychology notify / item receipt: the host (actor) must NOT see it.
    const m = { userId: HOST, targetUserId: PLAYER, audience: "recipient" as const };
    expect(canSee(m, PLAYER, false)).toBe(true); // the target
    expect(canSee(m, HOST, true)).toBe(false); // the actor/host does NOT see it
    expect(canSee(m, OTHER, true)).toBe(false); // bystander
  });

  it("directed: actor + target only (host gets no override)", () => {
    const m = { userId: HOST, targetUserId: PLAYER, audience: "directed" as const };
    expect(canSee(m, HOST, true)).toBe(true);
    expect(canSee(m, PLAYER, false)).toBe(true);
    expect(canSee(m, OTHER, true)).toBe(false);
  });

  it("dm: the two participants only", () => {
    const m = { userId: HOST, targetUserId: PLAYER, audience: "dm" as const };
    expect(canSee(m, HOST, false)).toBe(true);
    expect(canSee(m, PLAYER, false)).toBe(true);
    expect(canSee(m, OTHER, true)).toBe(false);
  });

  it("gm: the actor + any host", () => {
    const m = { userId: PLAYER, targetUserId: null, audience: "gm" as const };
    expect(canSee(m, PLAYER, false)).toBe(true); // actor
    expect(canSee(m, OTHER, true)).toBe(true); // host
    expect(canSee(m, OTHER, false)).toBe(false); // bystander
  });
});

describe("audience — channelOf / dmPartner", () => {
  it("everyone/directed/gm render in the public feed", () => {
    for (const audience of ["everyone", "directed", "gm"] as const) {
      const m = { userId: HOST, targetUserId: PLAYER, audience };
      expect(channelOf(m, HOST)).toBe("public");
      expect(channelOf(m, PLAYER)).toBe("public");
      expect(dmPartner(m, HOST)).toBeNull();
    }
  });

  it("dm routes to the other participant for each side", () => {
    const m = { userId: HOST, targetUserId: PLAYER, audience: "dm" as const };
    expect(channelOf(m, HOST)).toBe(PLAYER);
    expect(channelOf(m, PLAYER)).toBe(HOST);
    expect(dmPartner(m, PLAYER)).toBe(HOST);
  });

  it("self stays in the channel it was issued in (hidden roll)", () => {
    // Issued in public → public feed.
    const inPublic = { userId: PLAYER, targetUserId: null, audience: "self" as const };
    expect(channelOf(inPublic, PLAYER)).toBe("public");
    // Issued inside a DM with HOST → that DM tab (but only the actor ever sees it).
    const inDm = { userId: PLAYER, targetUserId: HOST, audience: "self" as const };
    expect(channelOf(inDm, PLAYER)).toBe(HOST);
    expect(canSee(inDm, HOST, true)).toBe(false); // the partner still cannot see it
    // Legacy rows that stored the actor's own id as target stay in public.
    const legacy = { userId: PLAYER, targetUserId: PLAYER, audience: "self" as const };
    expect(channelOf(legacy, PLAYER)).toBe("public");
  });
});

describe("audience — countsAsDmUnread", () => {
  it("counts an inbound dm turn for the recipient only", () => {
    const m = { userId: HOST, targetUserId: PLAYER, audience: "dm" as const };
    expect(countsAsDmUnread(m, PLAYER)).toBe(true); // recipient
    expect(countsAsDmUnread(m, HOST)).toBe(false); // own message
  });

  it("never counts inline notices (self/recipient/directed/gm/everyone)", () => {
    for (const audience of ["everyone", "self", "recipient", "directed", "gm"] as const) {
      const m = { userId: HOST, targetUserId: PLAYER, audience };
      expect(countsAsDmUnread(m, PLAYER)).toBe(false);
    }
  });
});

describe("audience — isAudience", () => {
  it("accepts known values and rejects others", () => {
    expect(isAudience("dm")).toBe(true);
    expect(isAudience("everyone")).toBe(true);
    expect(isAudience("whisper")).toBe(false);
    expect(isAudience(undefined)).toBe(false);
  });
});
