"use server";

import { db } from "@/db";
import { rooms, roomMembers, messages, users, roomSkills } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { broadcastToRoom } from "@/lib/server/events";
import { dispatchMessage } from "@/lib/messaging/router";
import { executeCommand } from "@/lib/commands/engine";
import { rollDie } from "@/lib/commands/dice";
import { checkRoomAccess } from "@/lib/auth/room-access";
import { dispatchDiceRoll } from "@/lib/messaging/dice-roll";
import { getTranslations } from "next-intl/server";
import { getRuleForRoom } from "@/lib/rules";
import type { CharacterData } from "@/lib/character/types";

// --- Host Skill Check Request ---

export async function requestSkillCheckAction(
  roomId: number,
  targetUserIds: number[],
  skillName: string,
  diceType: string = "d100",
  isPrivate: boolean = false,
  channelTargetUserId?: number,
  /** Rule-specialized fields (only honored when the rule declares `checkRequestOptions`). */
  extras?: { dc?: number; styleDice?: number }
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  // Rule-specialized requests (狩魂者): optional DC + style dice, name optional.
  const [reqRoom] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const checkOpts = getRuleForRoom(reqRoom || {}).capabilities.checkRequestOptions;

  const t = await getTranslations("roomActions");
  let cleanSkill = skillName.trim().slice(0, 50);
  if (!cleanSkill && checkOpts?.skillNameOptional) {
    cleanSkill = t("genericCheckName");
  }
  if (!cleanSkill || targetUserIds.length === 0) {
    return { success: false, error: "Invalid check request" };
  }

  // Validate/clamp the specialized fields against the rule's declared bounds.
  let shCheck: { dc: number | null; styleDice: number } | undefined;
  if (checkOpts) {
    const rawDc = extras?.dc;
    const dc = typeof rawDc === "number" && Number.isFinite(rawDc)
      ? Math.min(999, Math.max(0, Math.floor(rawDc)))
      : null;
    const styleBounds = checkOpts.styleDiceField;
    const rawStyle = extras?.styleDice ?? 0;
    const styleDice = styleBounds && Number.isFinite(rawStyle)
      ? Math.min(styleBounds.max, Math.max(styleBounds.min, Math.floor(rawStyle)))
      : 0;
    shCheck = { dc: checkOpts.dcField ? dc : null, styleDice };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));

  const hostNick = hostMember?.nickname || "Host";

  // Restrict targets to actual room members (and, in a DM channel, to the partner only).
  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  let validTargetIds = targetMembers.map((m: { userId: number }) => m.userId);
  if (isPrivate && channelTargetUserId) {
    validTargetIds = validTargetIds.filter((id) => id === channelTargetUserId);
  }
  if (validTargetIds.length === 0) {
    return { success: false, error: "No valid targets" };
  }

  const targetNicks = targetMembers
    .filter((m: { userId: number }) => validTargetIds.includes(m.userId))
    .map((m: { nickname: string }) => m.nickname);
  const targetNicksStr = targetNicks.join(t("separator"));
  const content = t("checkRequestContent", { hostNick, targetNicks: targetNicksStr, skillName: cleanSkill });
  const detail = JSON.stringify({
    checkRequest: { skillName: cleanSkill, diceType, targetUserIds: validTargetIds, hostNick, respondedUserIds: [], ...(shCheck ? { shCheck } : {}) }
  });

  const msg = await dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname: hostNick,
    type: "check_request",
    // A check issued in a DM belongs to that DM; a public check is for everyone.
    audience: isPrivate ? "dm" : "everyone",
    targetUserId: isPrivate ? channelTargetUserId : null,
    content,
    diceDetail: detail,
  });

  // Trigger any bot targets so they can respond (if their respond_check tool is enabled).
  const botTargets = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, validTargetIds), eq(users.isBot, true)));
  for (const bot of botTargets) {
    import("@/lib/ai/agent")
      .then(({ runAgent }) => runAgent(bot.id, roomId, { triggeringUserId: hostId, isPrivate, bypassCooldown: true }))
      .catch((err) => console.error("[requestSkillCheckAction] Failed to trigger bot:", err));
  }

  return msg;
}

/**
 * A designated target responds to a host check request: rolls the check in the same
 * channel, records the response on the check_request message, and broadcasts a
 * `check_update` so all clients update the x/y count and disable the roller's dice icon.
 */
export async function respondToCheckRequestAction(
  roomId: number,
  checkRequestId: number,
  opts?: { onBehalfOfUserId?: number; bonusDice?: number }
): Promise<{ success: boolean; error?: string; needsSkill?: boolean }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const callerId = parseInt(session.user.id);

  const proxyTargetId = opts?.onBehalfOfUserId;
  const isProxy = typeof proxyTargetId === "number";

  // Proxy is host-only; self-response stays writable-member.
  if (isProxy) {
    await checkRoomAccess(roomId, true);
  } else {
    await checkRoomAccess(roomId, false, { requireWritable: true });
  }
  const rollerId = isProxy ? proxyTargetId : callerId;

  const t = await getTranslations("roomActions");

  type CheckDetail = { checkRequest?: { skillName?: string; diceType?: string; targetUserIds?: number[]; respondedUserIds?: number[]; proxiedUserIds?: number[]; sanCheck?: { successExpr: string; failureExpr: string }; shCheck?: { dc?: number | null; styleDice?: number } } };

  // Claim the responder slot atomically BEFORE rolling. SELECT ... FOR UPDATE
  // serializes concurrent responders on the request row: without it, two
  // players clicking within the same second both read an empty
  // respondedUserIds and the later write erased the earlier response (count
  // stuck at 1/N), and a double-click could slip past the "already responded"
  // guard and roll twice.
  const claim = await db.transaction(async (tx) => {
    const [msg] = await tx.select().from(messages)
      .where(and(eq(messages.id, checkRequestId), eq(messages.roomId, roomId)))
      .for("update");
    if (!msg || msg.type !== "check_request" || !msg.diceDetail) {
      return { ok: false as const, error: t("checkRequestNotFound") };
    }

    let detail: CheckDetail;
    try { detail = JSON.parse(msg.diceDetail); } catch { return { ok: false as const, error: t("checkRequestNotFound") }; }
    const cr = detail.checkRequest;
    if (!cr || !cr.skillName) return { ok: false as const, error: t("checkRequestNotFound") };

    const targetUserIds = cr.targetUserIds || [];
    const responded = cr.respondedUserIds || [];
    if (!targetUserIds.includes(rollerId)) return { ok: false as const, error: t("checkNotTarget") };
    if (responded.includes(rollerId)) return { ok: false as const, error: t("checkAlreadyDone") };

    cr.respondedUserIds = [...responded, rollerId];
    if (isProxy) {
      cr.proxiedUserIds = [...(cr.proxiedUserIds ?? []), rollerId];
    }
    await tx.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, checkRequestId));
    return { ok: true as const, msg, cr };
  });
  if (!claim.ok) return { success: false, error: claim.error };
  const { msg, cr } = claim;

  // If the roll can't be produced after the claim (e.g. unset stat), release
  // the slot again so the player can retry once the stat is fixed.
  const unclaim = async () => {
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx.select({ diceDetail: messages.diceDetail }).from(messages)
          .where(eq(messages.id, checkRequestId))
          .for("update");
        if (!row?.diceDetail) return;
        const d = JSON.parse(row.diceDetail);
        const c = d?.checkRequest;
        if (!c) return;
        c.respondedUserIds = (c.respondedUserIds ?? []).filter((x: number) => x !== rollerId);
        if (isProxy) c.proxiedUserIds = (c.proxiedUserIds ?? []).filter((x: number) => x !== rollerId);
        await tx.update(messages).set({ diceDetail: JSON.stringify(d) }).where(eq(messages.id, checkRequestId));
      });
    } catch (e) {
      console.error("[respondToCheckRequestAction] Failed to release claimed response:", e);
    }
  };

  // For a proxy roll, surface the host's nickname so the dice bubble can show
  // a "代投 by <host>" chip (filled in by commands/engine.ts via diceDetail).
  let proxiedBy: { userId: number; nickname: string } | undefined;
  if (isProxy) {
    const [hostMember] = await db.select({ nickname: roomMembers.nickname }).from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, callerId)));
    proxiedBy = { userId: callerId, nickname: hostMember?.nickname || "Host" };
  }

  // Roll in the same channel as the request (public, or the DM with the host).
  const ctxIsPrivate = msg.isPrivate;
  const ctxTargetId = msg.isPrivate ? msg.userId : undefined;
  if (cr.sanCheck) {
    // Sanity check: run the .sc logic (uses 理智值 current value + deducts per result).
    const result = await executeCommand(roomId, rollerId, `.sc ${cr.sanCheck.successExpr}/${cr.sanCheck.failureExpr}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
    if (!result.success) {
      if (isProxy && result.code === "STAT_NOT_SET") {
        // Player has no 理智值 yet — fall through to a raw d100 attributed to them,
        // so the host gets a usable roll result instead of a hard error.
        await executeCommand(roomId, rollerId, `.rd100`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      } else {
        // needsSkill prompts the *self* to set their stat — meaningless for a proxy roll,
        // so surface as plain error and let the host inform the player out-of-band.
        await unclaim();
        return { success: false, error: result.error, needsSkill: !isProxy && result.code === "STAT_NOT_SET" };
      }
    }
  } else if (cr.shCheck) {
    // Rule-specialized check (狩魂者): synthesize the `.rc 名称+x±y DC` command
    // from the host's DC/style dice and the responder's bonus-dice count. The
    // DC is always made explicit (host value or the rule default 10) so a
    // check name that happens to end in digits can't be misread as a DC.
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    const maxBonus = getRuleForRoom(room || {}).capabilities.checkRequestOptions?.responderBonusDice?.max ?? 0;
    const rawX = opts?.bonusDice ?? 0;
    const x = Number.isFinite(rawX) ? Math.min(maxBonus, Math.max(0, Math.floor(rawX))) : 0;
    const y = cr.shCheck.styleDice ?? 0;
    const dc = typeof cr.shCheck.dc === "number" ? cr.shCheck.dc : 10;
    const group = x > 0 || y !== 0 ? `+${x}${y > 0 ? `+${y}` : y < 0 ? `${y}` : ""}` : "";
    const result = await executeCommand(roomId, rollerId, `.rc ${cr.skillName}${group} ${dc}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
    if (!result.success) {
      await unclaim();
      return { success: false, error: result.error };
    }
  } else {
    const diceType = cr.diceType || "d100";
    if (diceType === "d100") {
      const result = await executeCommand(roomId, rollerId, `.rc ${cr.skillName}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      if (!result.success) {
        if (isProxy && result.code === "STAT_NOT_SET") {
          // Skill not set on this player — drop the success/failure grading and just
          // roll a raw d100, attributed to the player + carrying the proxy chip.
          await executeCommand(roomId, rollerId, `.rd100`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
        } else {
          await unclaim();
          return { success: false, error: result.error, needsSkill: !isProxy && result.code === "STAT_NOT_SET" };
        }
      }
    } else {
      const faces = parseInt(diceType.replace("d", ""));
      if (isProxy) {
        // Route through executeCommand so the roll is attributed to the player and
        // carries the proxy chip; a plain dispatchDiceRoll would attribute it to the caller (host).
        await executeCommand(roomId, rollerId, `.rd${faces}`, { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId, proxiedBy });
      } else {
        // A check response is a normal roll in the request's channel (never hidden).
        // Access was checked above; rollerId is the caller here.
        await dispatchDiceRoll(roomId, rollerId, faces, 1, false, ctxTargetId);
      }
    }
  }

  // The response itself was already recorded by the claim transaction.
  // Broadcast the freshest completion state — a concurrent responder may have
  // appended after our claim, and each broadcast carries a full snapshot, so
  // re-reading makes the last-delivered event converge on the true set.
  let respondedNow = cr.respondedUserIds ?? [];
  let proxiedNow = cr.proxiedUserIds;
  try {
    const [fresh] = await db.select({ diceDetail: messages.diceDetail }).from(messages)
      .where(eq(messages.id, checkRequestId));
    const freshCr: CheckDetail["checkRequest"] = fresh?.diceDetail ? JSON.parse(fresh.diceDetail)?.checkRequest : undefined;
    if (freshCr?.respondedUserIds) {
      respondedNow = freshCr.respondedUserIds;
      proxiedNow = freshCr.proxiedUserIds;
    }
  } catch { /* fall back to the claim snapshot */ }
  // NOTE: do NOT reuse the message id here. The SSE stream dedups by `id`, and the
  // original check_request message (same id) was already delivered, so an `id`-keyed
  // event would be dropped server-side. Carry the target id under `checkRequestId`,
  // and mirror the request's audience so DM check_updates reach only the pair.
  broadcastToRoom(roomId, {
    type: "check_update",
    checkRequestId,
    respondedUserIds: respondedNow,
    proxiedUserIds: proxiedNow,
    audience: msg.audience,
    userId: msg.userId,
    targetUserId: msg.targetUserId,
  });

  return { success: true };
}

/**
 * Host-side preview for the proxy-roll popover: list every still-pending target
 * with their nickname and resolved check value (skill > COC attribute > resource),
 * so the host can see at a glance what they're about to roll against.
 */
export async function getProxyCheckTargetsAction(
  roomId: number,
  checkRequestId: number
): Promise<{
  success: boolean;
  error?: string;
  skillName?: string;
  isSanityCheck?: boolean;
  targets?: Array<{ userId: number; nickname: string; value: number | null }>;
}> {
  await checkRoomAccess(roomId, true);

  const [msg] = await db.select().from(messages)
    .where(and(eq(messages.id, checkRequestId), eq(messages.roomId, roomId)));
  if (!msg || msg.type !== "check_request" || !msg.diceDetail) {
    return { success: false, error: "check_request not found" };
  }
  let detail: { checkRequest?: { skillName?: string; targetUserIds?: number[]; respondedUserIds?: number[]; sanCheck?: unknown } };
  try { detail = JSON.parse(msg.diceDetail); } catch { return { success: false, error: "malformed detail" }; }
  const cr = detail.checkRequest;
  if (!cr || !cr.skillName || !cr.targetUserIds?.length) return { success: false, error: "invalid request" };

  const pending = cr.targetUserIds.filter((id: number) => !(cr.respondedUserIds || []).includes(id));
  if (pending.length === 0) {
    return { success: true, skillName: cr.skillName, isSanityCheck: !!cr.sanCheck, targets: [] };
  }

  const members = await db.select({
    userId: roomMembers.userId,
    nickname: roomMembers.nickname,
    characterData: roomMembers.characterData,
  })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, pending)));
  const memberByUid = new Map(members.map((m) => [m.userId, m]));

  // Rule-specific fallback (attribute / resource current value) for users
  // without an explicit room_skills row. Sanity check always reads the
  // player's current 理智值, so the lookup name is forced to "san" then.
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  const rule = room ? getRuleForRoom(room) : null;
  const lookupName = cr.sanCheck ? "san" : cr.skillName;

  // Also match any alternate spelling of the same skill (COC's 侦查/侦察) so
  // a host typing one spelling still finds players who stored the other.
  const skillNameCandidates = [cr.skillName, ...(rule?.skillAliasCandidates?.(cr.skillName) ?? [])];
  const skillRows = await db.select().from(roomSkills)
    .where(and(
      eq(roomSkills.roomId, roomId),
      inArray(roomSkills.userId, pending),
      inArray(roomSkills.skillName, skillNameCandidates),
    ));
  // Exact-name rows win over alias rows for the same user (rare double-store edge case).
  const aliasRows = skillRows.filter((r: { skillName: string }) => r.skillName !== cr.skillName);
  const exactRows = skillRows.filter((r: { skillName: string }) => r.skillName === cr.skillName);
  const valueByUid = new Map<number, number>([
    ...aliasRows.map((r: { userId: number; skillValue: number }) => [r.userId, r.skillValue] as const),
    ...exactRows.map((r: { userId: number; skillValue: number }) => [r.userId, r.skillValue] as const),
  ]);

  const targets = pending.map((uid: number) => {
    const m = memberByUid.get(uid);
    let value: number | null = valueByUid.get(uid) ?? null;
    if (value === null && rule && m?.characterData) {
      try {
        const sheet = JSON.parse(m.characterData) as CharacterData;
        const fallback = rule.lookupFallback(lookupName, sheet);
        if (fallback) value = fallback.value;
      } catch { /* leave value as null */ }
    }
    return { userId: uid, nickname: m?.nickname || `#${uid}`, value };
  });

  return { success: true, skillName: cr.skillName, isSanityCheck: !!cr.sanCheck, targets };
}

/**
 * COC 7th — Psychology hidden roll (心理学暗骰). KP rolls the 心理学 skill secretly for
 * each selected player; the result is shown ONLY to the KP. Each player just gets a
 * notification that a psychology check was made on them (no result). If a player hasn't
 * set 心理学, a plain d100 is rolled (still labelled as a psychology hidden roll).
 */
export async function psychologyHiddenRollAction(
  roomId: number,
  targetUserIds: number[],
  channelPartnerId?: number // when initiated inside a DM, keep the result/notify in that DM
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, error: "Room not found" };
  if (!getRuleForRoom(room).capabilities.hasPsychologyRoll) {
    return { success: false, error: "Psychology hidden roll not supported by this rule" };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  // Matches the neutral fallback used by every other host-nickname lookup in
  // this file; the rule's own title is applied client-side via useHostLabel().
  const hostNick = hostMember?.nickname || "Host";

  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  if (targetMembers.length === 0) return { success: false, error: "No valid targets" };

  const tRoom = await getTranslations("roomActions");

  for (const member of targetMembers) {
    const plId = member.userId;
    const plNick = member.nickname;

    const [skill] = await db.select().from(roomSkills).where(
      and(eq(roomSkills.roomId, roomId), eq(roomSkills.userId, plId), eq(roomSkills.skillName, "心理学"))
    );
    const roll = rollDie(100);

    // 1) KP-only dice bubble — structured diceDetail so the UI shows a normal
    //    check layout (skill / d100 / target / grade chip) with the dashed
    //    "audience=self" border and an eye icon driven by `psy: true`.
    let hostCheck: { skillName: string; target: number; roll: number; success: boolean; grade: "success" | "failure" | "critical" | "fumble" } | undefined;
    if (skill) {
      const target = skill.skillValue;
      const success = roll <= target;
      let grade: "success" | "failure" | "critical" | "fumble" = success ? "success" : "failure";
      if (roll <= 5) grade = "critical";
      else if (roll >= 96) grade = "fumble";
      hostCheck = { skillName: "心理学", target, roll, success, grade };
    }
    const hostDetail = JSON.stringify({
      notation: "1d100",
      dice: "1d100",
      sum: roll,
      results: [roll],
      ...(hostCheck ? { check: hostCheck } : {}),
      psy: { hostNick, targetNick: plNick },
    });
    const hostContent = skill
      ? tRoom("psyHeader", { hostNick, targetNick: plNick })
      : tRoom("psyHeaderNoSkill", { hostNick, targetNick: plNick });

    await dispatchMessage({
      roomId, actorUserId: hostId, nickname: hostNick,
      type: "dice", audience: "self", channelPartnerId,
      content: hostContent,
      diceDetail: hostDetail,
    });

    // 2) Player-side ghost notification — a check_request that's already "done"
    //    (respondedUserIds prefilled) so the UI shows the暗骰 badge with no
    //    action button. `ghost: true` routes the client to data-check-kind=gm-private.
    const playerDetail = JSON.stringify({
      checkRequest: {
        skillName: "心理学",
        diceType: "1d100",
        hostNick,
        targetUserIds: [plId],
        respondedUserIds: [plId],
        ghost: true,
      },
    });
    await dispatchMessage({
      roomId, actorUserId: hostId, nickname: hostNick,
      type: "check_request", audience: "recipient", targetUserId: plId, channelPartnerId,
      content: tRoom("psyNotify", { hostNick }),
      diceDetail: playerDetail,
    });
  }

  return { success: true };
}

/**
 * COC 7th — Sanity check request (理智检定). Like requestSkillCheckAction, but carries the
 * success/failure loss expressions; when a target rolls, respondToCheckRequestAction runs
 * the .sc logic (uses their 理智值 current value and deducts per result).
 */
export async function requestSanCheckAction(
  roomId: number,
  targetUserIds: number[],
  successExpr: string,
  failureExpr: string,
  isPrivate: boolean = false,
  channelTargetUserId?: number
) {
  const { userId: hostId } = await checkRoomAccess(roomId, true);

  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
  if (!room) return { success: false, error: "Room not found" };
  if (!getRuleForRoom(room).capabilities.hasSanity) {
    return { success: false, error: "Sanity check not supported by this rule" };
  }

  const sExpr = (successExpr || "").trim();
  const fExpr = (failureExpr || "").trim();
  const exprOk = (e: string) => e.length > 0 && e.length <= 30 && /^[0-9a-z+\-d\s]+$/i.test(e);
  if (!exprOk(sExpr) || !exprOk(fExpr) || targetUserIds.length === 0) {
    return { success: false, error: "Invalid san check" };
  }

  const [hostMember] = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, hostId)));
  const hostNick = hostMember?.nickname || "Host";

  const targetMembers = await db.select().from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, targetUserIds)));
  let validTargetIds = targetMembers.map((m: { userId: number }) => m.userId);
  if (isPrivate && channelTargetUserId) {
    validTargetIds = validTargetIds.filter((id) => id === channelTargetUserId);
  }
  if (validTargetIds.length === 0) return { success: false, error: "No valid targets" };

  const targetNicks = targetMembers
    .filter((m: { userId: number }) => validTargetIds.includes(m.userId))
    .map((m: { nickname: string }) => m.nickname);
  const t = await getTranslations("roomActions");
  const targetNicksStr = targetNicks.join(t("separator"));
  const content = t("sanCheckRequestContent", { hostNick, targetNicks: targetNicksStr });
  const detail = JSON.stringify({
    checkRequest: { skillName: "理智值", diceType: "d100", targetUserIds: validTargetIds, hostNick, respondedUserIds: [], sanCheck: { successExpr: sExpr, failureExpr: fExpr } }
  });

  const msg = await dispatchMessage({
    roomId,
    actorUserId: hostId,
    nickname: hostNick,
    type: "check_request",
    audience: isPrivate ? "dm" : "everyone",
    targetUserId: isPrivate ? channelTargetUserId : null,
    content,
    diceDetail: detail,
  });

  // Trigger any bot targets so they can respond (if their respond_check tool is enabled).
  const botTargets = await db.select({ id: users.id }).from(users)
    .where(and(inArray(users.id, validTargetIds), eq(users.isBot, true)));
  for (const bot of botTargets) {
    import("@/lib/ai/agent")
      .then(({ runAgent }) => runAgent(bot.id, roomId, { triggeringUserId: hostId, isPrivate, bypassCooldown: true }))
      .catch((err) => console.error("[requestSanityCheckAction] Failed to trigger bot:", err));
  }

  return msg;
}
