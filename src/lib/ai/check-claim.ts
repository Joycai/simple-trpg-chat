import 'server-only';
import { db } from '@/db';
import { messages } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { canSee } from '@/lib/messaging/audience';

interface CheckDetail {
  checkRequest?: {
    skillName?: string; diceType?: string; targetUserIds?: number[]; respondedUserIds?: number[]; proxiedUserIds?: number[];
    sanCheck?: { successExpr: string; failureExpr: string }; shCheck?: { dc?: number | null; styleDice?: number };
  };
}
/** Shares the request row lock with the human responder path. Claim before side effects. */
export async function claimBotCheck(roomId: number, requestId: number, botUserId: number) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(messages).where(and(eq(messages.id, requestId), eq(messages.roomId, roomId))).for('update');
    if (!row || row.type !== 'check_request' || !canSee(row, botUserId, false)) return null;
    let detail: CheckDetail;
    try { detail = JSON.parse(row.diceDetail ?? '{}'); } catch { return null; }
    const cr = detail.checkRequest;
    if (!cr?.skillName || !cr.targetUserIds?.includes(botUserId) || cr.respondedUserIds?.includes(botUserId)) return null;
    cr.respondedUserIds = [...(cr.respondedUserIds ?? []), botUserId];
    await tx.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, row.id));
    return { row, cr };
  });
}
/** Only release on a known pre-effect failure, never on an ambiguous exception. */
export async function releaseBotCheck(requestId: number, botUserId: number) {
  await db.transaction(async tx => {
    const [row] = await tx.select().from(messages).where(eq(messages.id, requestId)).for('update');
    if (!row?.diceDetail) return;
    const detail: CheckDetail = JSON.parse(row.diceDetail);
    if (!detail.checkRequest) return;
    detail.checkRequest.respondedUserIds = (detail.checkRequest.respondedUserIds ?? []).filter(id => id !== botUserId);
    await tx.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, row.id));
  });
}
