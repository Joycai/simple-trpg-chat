import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { users, rooms, messages } from '@/db/schema';

/** Opt-in local PostgreSQL regression test. All fixtures are isolated and removed. */
describe.skipIf(process.env.TEST_RUNTIME_DATABASE !== '1')('runtime PostgreSQL concurrency', () => {
  let db: typeof import('@/db')['db'];
  let roomId: number;
  const ids: number[] = [];
  beforeAll(async () => {
    db = (await import('@/db')).db;
    const inserted = await db.insert(users).values([0, 1, 2].map(i => ({ username: `runtime-test-${randomUUID()}`, passwordHash: 'not-a-login', displayName: `Runtime test ${i}`, isBot: i > 0 }))).returning();
    ids.push(...inserted.map(r => r.id));
    const [room] = await db.insert(rooms).values({ name: 'Isolated runtime regression', hostId: ids[0], secretKey: randomUUID() }).returning();
    roomId = room.id;
  });
  afterAll(async () => {
    if (!db) return;
    if (roomId) await db.delete(rooms).where(eq(rooms.id, roomId));
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  });
  it('serializes duplicate and distinct responders without losing updates', async () => {
    const { claimBotCheck, releaseBotCheck } = await import('../check-claim');
    const [request] = await db.insert(messages).values({ roomId, userId: ids[0], nickname: 'Host', content: 'check', type: 'check_request', audience: 'everyone', diceDetail: JSON.stringify({ checkRequest: { skillName: '侦查', targetUserIds: ids.slice(1), respondedUserIds: [] } }) }).returning();
    const claims = await Promise.all([claimBotCheck(roomId, request.id, ids[1]), claimBotCheck(roomId, request.id, ids[1]), claimBotCheck(roomId, request.id, ids[2])]);
    expect(claims.filter(Boolean)).toHaveLength(2);
    const [row] = await db.select().from(messages).where(eq(messages.id, request.id));
    expect(JSON.parse(row.diceDetail!).checkRequest.respondedUserIds.sort()).toEqual(ids.slice(1).sort());
    await releaseBotCheck(request.id, ids[1]);
    const [released] = await db.select().from(messages).where(eq(messages.id, request.id));
    expect(JSON.parse(released.diceDetail!).checkRequest.respondedUserIds).toEqual([ids[2]]);
  });
  it('preserves edited configuration and rejects stale summary completion', async () => {
    const { saveSummary } = await import('../bot-summary');
    const baseline = { historicalSummary: '', lastSummarizedMsgId: 0 };
    const edited = { ...baseline, model: 'new-model', enableTools: [], imageProviderId: 99 };
    await db.update(users).set({ botConfigJson: JSON.stringify(edited) }).where(eq(users.id, ids[1]));
    await saveSummary(ids[1], baseline, 'new summary', 50);
    await saveSummary(ids[1], baseline, 'older summary', 30);
    const [bot] = await db.select().from(users).where(eq(users.id, ids[1]));
    expect(JSON.parse(bot.botConfigJson!)).toEqual({ ...edited, historicalSummary: 'new summary', lastSummarizedMsgId: 50 });
  });
});
