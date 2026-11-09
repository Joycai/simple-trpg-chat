import { describe, it, expect } from "vitest";
import { partitionExportMessages, type ExportMessageRow } from "../export-timeline";

/**
 * Export must mirror the live visibility model, not a private copy of it:
 * - a host may NOT export another player's `self` hidden roll,
 * - a host may NOT export a `recipient`-only notice,
 * - a host MUST export a DM they participate in (in either direction),
 * - a player↔player DM never reaches the host's export.
 */
const HOST = 1;
const PLAYER = 2;
const MATE = 3;

function row(over: Partial<ExportMessageRow> & Pick<ExportMessageRow, "id" | "userId" | "audience">): ExportMessageRow {
  return {
    targetUserId: null,
    nickname: `u${over.userId}`,
    type: "text",
    content: `msg-${over.id}`,
    diceDetail: null,
    createdAt: "2026-11-09T00:00:00.000Z",
    ...over,
  };
}

const nicknameFor = (uid: number) =>
  ({ [HOST]: "KP", [PLAYER]: "Ann", [MATE]: "Bo" } as Record<number, string>)[uid];

describe("partitionExportMessages", () => {
  it("keeps public chat on the timeline", () => {
    const out = partitionExportMessages([row({ id: 1, userId: PLAYER, audience: "everyone" })], HOST, true, nicknameFor);
    expect(out.timeline.map((i) => i.content)).toEqual(["msg-1"]);
    expect(out.privateConversations).toEqual({});
  });

  it("drops another player's self-only hidden roll", () => {
    const out = partitionExportMessages([
      row({ id: 2, userId: PLAYER, audience: "self", content: "🔒 secret" }),
      row({ id: 3, userId: HOST, audience: "self", content: "KP private" }),
    ], HOST, true, nicknameFor);

    expect(out.timeline.map((i) => i.content)).toEqual(["KP private"]);
    expect(JSON.stringify(out)).not.toContain("🔒 secret");
  });

  it("drops a recipient-only notice the host is not the target of", () => {
    const out = partitionExportMessages([
      row({ id: 4, userId: HOST, targetUserId: PLAYER, audience: "recipient", content: "for Ann" }),
    ], HOST, true, nicknameFor);

    expect(out.timeline).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("for Ann");
  });

  it("drops a player↔player DM", () => {
    const out = partitionExportMessages([
      row({ id: 5, userId: PLAYER, targetUserId: MATE, audience: "dm", content: "between players" }),
    ], HOST, true, nicknameFor);

    expect(out.timeline).toEqual([]);
    expect(out.privateConversations).toEqual({});
  });

  it("keeps DMs the host participates in, in both directions", () => {
    const out = partitionExportMessages([
      row({ id: 6, userId: PLAYER, targetUserId: HOST, audience: "dm", content: "player→KP" }),
      row({ id: 7, userId: HOST, targetUserId: PLAYER, audience: "dm", content: "KP→player" }),
    ], HOST, true, nicknameFor);

    const pair = "1-2";
    expect(out.privateConversations[pair]?.map((i) => i.content)).toEqual(["player→KP", "KP→player"]);
    expect(out.privateConversations[pair][0].targetNickname).toBe("KP");
    expect(out.timeline).toEqual([]);
  });

  it("keeps gm output visible to the host, whoever wrote it", () => {
    // `gm` is "the actor + the room host" by definition, so the host export
    // legitimately includes both their own and a player's gm-scoped message.
    const out = partitionExportMessages([
      row({ id: 8, userId: HOST, audience: "gm", content: "KP gm" }),
      row({ id: 9, userId: PLAYER, audience: "gm", content: "player gm" }),
    ], HOST, true, nicknameFor);

    expect(out.timeline.map((i) => i.content)).toEqual(["KP gm", "player gm"]);
  });

  it("does not show a player's gm output to a non-host viewer", () => {
    const out = partitionExportMessages([
      row({ id: 9, userId: PLAYER, audience: "gm", content: "player gm" }),
    ], MATE, false, nicknameFor);

    expect(out.timeline).toEqual([]);
  });

  it("re-applies canSee even when the SQL predicate was bypassed", () => {
    // Defensive layer: a caller that forgets messageVisibilityWhere still cannot
    // leak rows the viewer may not see.
    const out = partitionExportMessages([
      row({ id: 10, userId: PLAYER, targetUserId: MATE, audience: "directed", content: "pushed clue" }),
    ], HOST, false, nicknameFor);

    expect(out.timeline).toEqual([]);
    expect(out.privateConversations).toEqual({});
  });
});
