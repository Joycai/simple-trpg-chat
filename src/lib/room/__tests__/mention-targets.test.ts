import { describe, it, expect } from "vitest";
import { primaryVital } from "@/lib/rules";
import { buildMentionTargets, buildDmConversations, totalUnread, countRoster, countOnline, type RosterEntry } from "../mention-targets";

const human = (id: number, nickname?: string): RosterEntry => ({
  users: { id, isBot: false, displayName: `user${id}` },
  room_members: nickname ? { nickname } : {},
});
const bot = (id: number): RosterEntry => ({
  users: { id, isBot: true, displayName: `bot${id}`, botConfigJson: JSON.stringify({ providerId: 7 }) },
  room_members: { nickname: `Bot ${id}` },
});

describe("buildMentionTargets", () => {
  it("drops the viewer and names members by nickname, then display name", () => {
    const out = buildMentionTargets([human(1, "Me"), human(2, "Alice"), human(3)], 1, true, []);
    expect(out.map((t) => [t.id, t.nickname])).toEqual([[2, "Alice"], [3, "user3"]]);
  });

  it("falls back to #id when there is no name at all", () => {
    expect(buildMentionTargets([{ user_id: 9 }], 1, true, [])[0].nickname).toBe("#9");
  });

  it("marks bots disabled when AI is off", () => {
    const [t] = buildMentionTargets([bot(5)], 1, false, []);
    expect(t).toMatchObject({ isBot: true, isBotDisabled: true });
  });

  it("reads the primary vital from the member's sheet", () => {
    const sheet = { ruleTemplate: "coc7th", attributes: {}, resources: { hp_current: 7, hp_max: 10 } };
    const [t] = buildMentionTargets([{ ...human(2), room_members: { characterData: JSON.stringify(sheet) } }], 1, true, []);
    expect(t.vital).toEqual(primaryVital(sheet as never));
    expect(buildMentionTargets([human(2)], 1, true, [])[0].vital).toBeNull();
  });
});

describe("buildDmConversations", () => {
  it("carries unread, presence and prefers the live vital", () => {
    const targets = buildMentionTargets([human(2, "A"), human(3, "B")], 1, true, []);
    const live = { key: "hp", label: "HP", current: 3, max: 10 } as never;
    const out = buildDmConversations(targets, { 2: 4 }, new Set([3]), new Map([[3, live]]));
    expect(out[0]).toMatchObject({ userId: 2, unread: 4, isOnline: false });
    expect(out[1]).toMatchObject({ userId: 3, unread: 0, isOnline: true, vital: live });
  });
});

describe("totalUnread", () => {
  it("sums every conversation", () => {
    expect(totalUnread({})).toBe(0);
    expect(totalUnread({ 2: 3, 5: 1 })).toBe(4);
  });
});

describe("countRoster / countOnline", () => {
  const roster = [human(1), human(2), human(3), bot(5)];
  it("splits bots from members", () => {
    expect(countRoster(roster)).toEqual({ botCount: 1, playerCount: 3 });
    expect(countRoster([])).toEqual({ botCount: 0, playerCount: 0 });
  });
  it("counts the viewer plus connected members, never bots", () => {
    expect(countOnline(roster, 1, new Set())).toBe(1);
    expect(countOnline(roster, 1, new Set([2, 5]))).toBe(2);
    expect(countOnline([{ user_id: 7 }], 1, new Set([7]))).toBe(1);
  });
});
