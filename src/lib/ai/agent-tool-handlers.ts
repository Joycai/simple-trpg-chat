import { db, sqlNow } from "@/db";
import { users, messages, inventoryDistributions, inventoryItems, rooms, roomMembers, roomSkills, clueCards, clueVisibility } from "@/db/schema";
import { eq, and, desc, sql, or, isNull, inArray } from "drizzle-orm";
import { broadcastToRoom } from "@/lib/server/events";
import { dispatchMessage, messageVisibilityWhere } from "@/lib/messaging/router";
import { buildDispatchPayload, buildReceiptPayload } from "@/lib/messaging/dispatch-payload";
import { shareItemCore } from "@/lib/room/inventory-share";
import { getTranslations } from "next-intl/server";
import { rollDice } from "@/lib/commands/dice";
import { executeCommand } from "@/lib/commands/engine";
import type { CharacterData } from "@/lib/character/types";
import { clampInt, getRuleForRoom } from "@/lib/rules";
import type { ParsedToolArgs } from "@/lib/ai/agent-tool-guard";

/**
 * Execution side of the bot agent's tools. Each handler runs one validated
 * tool call (name whitelisted and arguments parsed by `resolveToolCall`) on
 * the bot's behalf and returns the JSON-serializable result fed back to the
 * model. Handlers validate their own argument fields and report problems as
 * `{ success: false, error }` results rather than throwing.
 */

export interface AgentToolContext {
  roomId: number;
  botUserId: number;
  botNickname: string;
  room: typeof rooms.$inferSelect;
  /** Whether the run was triggered from a DM; tools default to that channel. */
  replyIsPrivate: boolean;
  /** DM partner for private replies (falls back to the room host). */
  targetUserId: number | null;
}

export type AgentToolHandler = (args: ParsedToolArgs, ctx: AgentToolContext) => Promise<unknown>;

async function rollDiceTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, botNickname, room, targetUserId } = ctx;
  const count = Math.max(1, Math.min(args.count || 1, 20));
  const faces = Math.max(1, Math.min(args.faces || 6, 1000));
  const { results: rollResults, sum } = rollDice(faces, count);
  const detail = JSON.stringify({ dice: `d${faces}`, count, results: rollResults, sum, isBot: true });
  const content = `(${botNickname}) 🎲 ${count}d${faces}: [${rollResults.join(", ")}] = ${sum}`;
  await dispatchMessage({
    roomId,
    actorUserId: botUserId,
    nickname: botNickname,
    type: "dice",
    audience: args.isPrivate ? "dm" : "everyone",
    targetUserId: args.isPrivate ? targetUserId : null,
    content: args.isPrivate ? `🔒 ${content}` : content,
    diceDetail: detail,
  });

  // Crit/fumble bounds belong to the rule: the module decides what a
  // plain roll means for its system via `naturalGrade` (COC reads
  // 01–05 / 96–100 on a raw 1d100; basic adds a "CoC-cultural" hint;
  // other rules return null). The engine never branches on rule id.
  const rollRule = getRuleForRoom(room || {});
  const evaluation = rollRule.naturalGrade?.(sum, faces, count) ?? undefined;

  return {
    success: true,
    results: rollResults,
    sum,
    ruleTemplate: rollRule.id,
    ...(evaluation ? { evaluation } : {})
  };
}

async function respondCheckTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId } = ctx;
  // Find the pending check_request(s) the host issued to this bot.
  // Mirrors respondToCheckRequestAction (actions/checks.ts) but runs without a
  // session, attributing the roll to the bot.
  const candidates = await db.select({
    id: messages.id,
    diceDetail: messages.diceDetail,
    isPrivate: messages.isPrivate,
    audience: messages.audience,
    userId: messages.userId,
    targetUserId: messages.targetUserId,
  }).from(messages)
    .where(and(
      // Only checks visible to the bot (audience model).
      messageVisibilityWhere(roomId, botUserId, false),
      eq(messages.type, "check_request")
    ))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  let chosen: {
    row: typeof candidates[number];
    cr: { skillName?: string; diceType?: string; targetUserIds?: number[]; respondedUserIds?: number[]; sanCheck?: { successExpr: string; failureExpr: string } };
  } | null = null;
  for (const row of candidates) {
    if (args.checkRequestId && row.id !== args.checkRequestId) continue;
    let cr;
    try { cr = JSON.parse(row.diceDetail || "{}").checkRequest; } catch { continue; }
    if (!cr || !cr.skillName) continue;
    const targets: number[] = cr.targetUserIds || [];
    const responded: number[] = cr.respondedUserIds || [];
    if (targets.includes(botUserId) && !responded.includes(botUserId)) {
      chosen = { row, cr };
      break;
    }
  }

  if (!chosen) {
    return { success: false, error: "No pending check request is awaiting your response." };
  } else {
    const { row, cr } = chosen;
    // Roll in the same channel the request was issued in.
    const ctxIsPrivate = row.isPrivate;
    const ctxTargetId = row.isPrivate ? row.userId : undefined;
    const ctx = { isPrivate: ctxIsPrivate, targetUserId: ctxTargetId };

    let cmdResult;
    if (cr.sanCheck) {
      cmdResult = await executeCommand(roomId, botUserId, `.sc ${cr.sanCheck.successExpr}/${cr.sanCheck.failureExpr}`, ctx);
    } else if ((cr.diceType || "d100") === "d100") {
      cmdResult = await executeCommand(roomId, botUserId, `.rc ${cr.skillName}`, ctx);
    } else {
      const faces = parseInt((cr.diceType || "d100").replace("d", ""));
      cmdResult = await executeCommand(roomId, botUserId, `.rd${faces}`, ctx);
    }

    if (!cmdResult.success) {
      // STAT_NOT_SET: the bot has no value for this skill/stat yet.
      return {
        success: false,
        error: cmdResult.error,
        needsSkill: cmdResult.code === "STAT_NOT_SET",
        hint: cmdResult.code === "STAT_NOT_SET"
          ? `Set "${cr.skillName}" via set_character_card, then call respond_check again.`
          : undefined,
      };
    } else {
      // Record the response and broadcast the completion update so the
      // host's check bubble marks the bot as done (same as a click).
      // Re-parse the row defensively — the original parse happened in
      // the candidates scan above, but the row could have been rewritten
      // by another responder between then and now; without this guard a
      // malformed payload throws a TypeError that the outer catch turns
      // into an opaque error message in the tool result.
      let detail: { checkRequest?: { respondedUserIds?: number[]; proxiedUserIds?: number[] } } | null = null;
      try {
        detail = JSON.parse(row.diceDetail || "{}");
      } catch {
        detail = null;
      }
      if (!detail?.checkRequest) {
        return { success: false, error: "Check request payload malformed; refresh and try again." };
      } else {
        const responded: number[] = detail.checkRequest.respondedUserIds || [];
        const newResponded = [...responded, botUserId];
        detail.checkRequest.respondedUserIds = newResponded;
        await db.update(messages).set({ diceDetail: JSON.stringify(detail) }).where(eq(messages.id, row.id));
        broadcastToRoom(roomId, {
          type: "check_update",
          checkRequestId: row.id,
          respondedUserIds: newResponded,
          proxiedUserIds: detail.checkRequest.proxiedUserIds,
          audience: row.audience,
          userId: row.userId,
          targetUserId: row.targetUserId,
        });
        const outcome = (cmdResult.message as { content?: string } | undefined)?.content;
        return { success: true, skillName: cr.skillName, sanityCheck: !!cr.sanCheck, ...(outcome ? { outcome } : {}) };
      }
    }
  }
}

async function rollSkillCheckTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, replyIsPrivate, targetUserId } = ctx;
  const raw = typeof args.expression === "string" ? args.expression.trim() : "";
  // Tolerate the model echoing the command prefix back.
  const expression = raw.replace(/^[.。]\s*rc\s*/i, "");
  if (!expression || expression.length > 100) {
    return { success: false, error: "expression must be a non-empty string up to 100 characters (the text after '.rc')" };
  } else {
    // Default to the triggering channel so a DM-triggered bot doesn't
    // leak its roll into the public feed.
    const priv = typeof args.isPrivate === "boolean" ? args.isPrivate : replyIsPrivate;
    const ctx = priv && targetUserId ? { isPrivate: true, targetUserId } : undefined;
    const cmdResult = await executeCommand(roomId, botUserId, `.rc ${expression}`, ctx);
    if (!cmdResult.success) {
      return {
        success: false,
        error: cmdResult.error,
        needsSkill: cmdResult.code === "STAT_NOT_SET",
        hint: cmdResult.code === "STAT_NOT_SET"
          ? "Set the skill/stat via set_character_card, then call roll_skill_check again."
          : undefined,
      };
    } else {
      const outcome = (cmdResult.message as { content?: string } | undefined)?.content;
      return { success: true, ...(outcome ? { outcome } : {}) };
    }
  }
}

async function listMembersTool(_args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, room } = ctx;
  const members = await db.select({
    userId: roomMembers.userId,
    nickname: roomMembers.nickname,
    isBot: users.isBot,
  }).from(roomMembers)
    .innerJoin(users, eq(roomMembers.userId, users.id))
    .where(eq(roomMembers.roomId, roomId))
    .limit(100);
  return {
    count: members.length,
    members: members.map(m => ({
      userId: m.userId,
      nickname: m.nickname,
      isHost: m.userId === room.hostId,
      isBot: !!m.isBot,
      isSelf: m.userId === botUserId,
    })),
  };
}

async function giveItemTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, botNickname } = ctx;
  const itemId = Number(args.itemId);
  const toUserId = Number(args.toUserId);
  if (!Number.isInteger(itemId) || !Number.isInteger(toUserId)) {
    return { success: false, error: "itemId and toUserId must be integers" };
  } else if (toUserId === botUserId) {
    return { success: false, error: "You cannot give an item to yourself." };
  } else {
    const [recipientUser] = await db.select({ isBot: users.isBot }).from(users).where(eq(users.id, toUserId));
    if (!recipientUser) {
      return { success: false, error: "Recipient user not found" };
    } else if (recipientUser.isBot) {
      return { success: false, error: "You cannot give items to another bot." };
    } else {
      const shareResult = await shareItemCore({
        roomId,
        itemId,
        fromUserId: botUserId,
        toUserId,
        senderName: botNickname,
      });
      return shareResult.success
        ? { success: true, itemTitle: shareResult.itemTitle, recipient: shareResult.recipientName }
        : { success: false, code: shareResult.code, error: shareResult.error };
    }
  }
}

async function revealClueTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, botNickname } = ctx;
  const clueId = Number(args.clueId);
  const rawTargets: unknown[] = Array.isArray(args.targetUserIds) ? args.targetUserIds : [];
  const targetIds = [...new Set(rawTargets.map(Number).filter(n => Number.isInteger(n)))].slice(0, 30);
  if (!Number.isInteger(clueId) || targetIds.length === 0) {
    return { success: false, error: "clueId (integer) and a non-empty targetUserIds array are required" };
  } else {
    const [clue] = await db.select().from(clueCards)
      .where(and(eq(clueCards.id, clueId), eq(clueCards.roomId, roomId)));
    if (!clue) {
      return { success: false, error: "Clue not found in this room" };
    } else {
      const visRows = await db.select({ userId: clueVisibility.userId })
        .from(clueVisibility)
        .where(eq(clueVisibility.clueId, clueId));
      const isPublic = visRows.some(v => v.userId === null);
      // Scoped down from the host's reveal power: the bot may only
      // pass on clues it has itself been given.
      if (!isPublic && !visRows.some(v => v.userId === botUserId)) {
        return { success: false, error: "Unauthorized: this clue has not been revealed to you" };
      } else if (isPublic) {
        return { success: true, alreadyPublic: true, revealedTo: [] };
      } else {
        const memberRows = await db.select({ userId: roomMembers.userId, isBot: users.isBot })
          .from(roomMembers)
          .innerJoin(users, eq(roomMembers.userId, users.id))
          .where(eq(roomMembers.roomId, roomId));
        const humanMembers = new Set(memberRows.filter(m => !m.isBot).map(m => m.userId));
        const alreadyVisible = new Set(visRows.map(v => v.userId));
        const invalid = targetIds.filter(uid => !humanMembers.has(uid));
        if (invalid.length > 0) {
          return { success: false, error: `Invalid target user ids (not human members of this room): ${invalid.join(", ")}` };
        } else {
          const newTargets = targetIds.filter(uid => !alreadyVisible.has(uid));
          if (newTargets.length === 0) {
            return { success: true, revealedTo: [], note: "All targets can already see this clue." };
          } else {
            await db.insert(clueVisibility).values(newTargets.map(uid => ({ clueId, userId: uid })));
            const tClue = await getTranslations("clueActions");
            for (const uid of newTargets) {
              await dispatchMessage({
                roomId,
                actorUserId: botUserId,
                nickname: botNickname,
                type: "system",
                audience: "recipient",
                targetUserId: uid,
                systemKind: "inventory-receipt",
                content: tClue("clueReceived", { title: clue.title }),
                diceDetail: buildReceiptPayload({
                  action: "received",
                  itemType: "clue",
                  itemTitle: clue.title,
                }),
              });
            }
            const recipients = await db.select({ name: users.displayName })
              .from(users)
              .where(inArray(users.id, newTargets));
            const recipientNames = recipients.map(r => r.name).join(", ");
            await dispatchMessage({
              roomId,
              actorUserId: botUserId,
              nickname: botNickname,
              type: "system",
              audience: "gm",
              systemKind: "inventory-dispatch",
              content: tClue("cluePushLog", { recipients: recipientNames || tClue("defaultPlayers"), title: clue.title }),
              diceDetail: buildDispatchPayload({
                action: "push",
                itemType: "clue",
                itemTitle: clue.title,
                recipient: { kind: "user", name: recipientNames || tClue("defaultPlayers") },
              }),
            });
            return { success: true, clueTitle: clue.title, revealedTo: newTargets };
          }
        }
      }
    }
  }
}

async function sendImageTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, botNickname, targetUserId } = ctx;
  const imageUrl = String(args.imageUrl || "").trim();
  // Internal images are pinned to THIS room so other members can
  // actually load them (the image route authorizes by the room id in
  // the path). External links are restricted to https:// to avoid
  // mixed-content breakage and to keep the surface narrow.
  const isInternal = new RegExp(`^/api/rooms/${roomId}/images/[A-Za-z0-9._-]+$`).test(imageUrl);
  const isHttps = /^https:\/\/\S+$/i.test(imageUrl) && imageUrl.length <= 2048;
  if (!isInternal && !isHttps) {
    return { success: false, error: "Invalid image URL. Use an internal image path for this room, or a public https:// URL." };
  } else {
    await dispatchMessage({
      roomId,
      actorUserId: botUserId,
      nickname: botNickname,
      type: "image",
      audience: args.isPrivate ? "dm" : "everyone",
      targetUserId: args.isPrivate ? targetUserId : null,
      content: imageUrl,
    });
    return { success: true };
  }
}

async function inspectItemTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId } = ctx;
  // Validate that the item belongs to this room
  const [item] = await db.select().from(inventoryItems).where(
    and(
      eq(inventoryItems.id, args.itemId),
      eq(inventoryItems.roomId, roomId)
    )
  );
  if (!item) {
    return { error: "Item not found in this room" };
  } else {
    // Validate that the bot actually possesses this item
    const [possession] = await db.select().from(inventoryDistributions).where(
      and(
        eq(inventoryDistributions.roomId, roomId),
        eq(inventoryDistributions.itemId, args.itemId),
        eq(inventoryDistributions.toUserId, botUserId)
      )
    );
    if (!possession) {
      return { error: "Unauthorized: You do not possess this item" };
    } else {
      return { title: item.title, content: JSON.parse(item.contentJson) };
    }
  }
}

async function searchHistoryTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId } = ctx;
  // Defend against runaway LLM inputs: an oversize query would expand
  // into a huge LIKE pattern and tank the messages-table scan. The
  // model has no legitimate reason to send >100 chars.
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query || query.length > 100) {
    return { error: "query must be a non-empty string up to 100 characters" };
  } else {
    const safeQuery = query.replace(/[%_\\]/g, '\\$&');

    const limit = Math.min(args.limit || 10, 20);
    // Use SQL LIKE for keyword search on message content
    const results = await db.select({
      id: messages.id,
      nickname: messages.nickname,
      content: messages.content,
      type: messages.type,
      createdAt: messages.createdAt,
    }).from(messages)
      .where(
        and(
          messageVisibilityWhere(roomId, botUserId, false),
          sql`${messages.content} LIKE ${'%' + safeQuery + '%'} ESCAPE '\\'`
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return {
      query,
      count: results.length,
      results: results.map(r => ({
        nickname: r.nickname,
        content: r.content.slice(0, 300), // Truncate long messages
        type: r.type,
        time: r.createdAt,
      }))
    };
  }
}

async function myInventoryTool(_args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId } = ctx;
  const dists = await db.query.inventoryDistributions.findMany({
    where: and(
      eq(inventoryDistributions.roomId, roomId),
      eq(inventoryDistributions.toUserId, botUserId)
    ),
    with: { item: true }
  });
  return {
    count: dists.length,
    items: dists.map(d => ({
      id: d.itemId,
      title: d.item.title,
      type: d.item.type,
    }))
  };
}

async function myCluesTool(_args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId } = ctx;
  const clueRows = await db.select({
    id: clueCards.id,
    title: clueCards.title,
    content: clueCards.content,
  }).from(clueCards)
    .innerJoin(clueVisibility, eq(clueCards.id, clueVisibility.clueId))
    .where(
      and(
        eq(clueCards.roomId, roomId),
        or(
          isNull(clueVisibility.userId),
          eq(clueVisibility.userId, botUserId)
        )
      )
    );
  return {
    count: clueRows.length,
    clues: clueRows.map(c => ({
      id: c.id,
      title: c.title,
      content: c.content?.slice(0, 200),
    }))
  };
}

async function myCharacterTool(_args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, room } = ctx;
  const [memberInfo] = await db.select({
    characterData: roomMembers.characterData,
  }).from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, botUserId)
    ));
  const skills = await db.select({
    skillName: roomSkills.skillName,
    skillValue: roomSkills.skillValue,
  }).from(roomSkills)
    .where(and(
      eq(roomSkills.roomId, roomId),
      eq(roomSkills.userId, botUserId)
    ));
  const charData: CharacterData | null = memberInfo?.characterData
    ? JSON.parse(memberInfo.characterData)
    : null;
  // `exportSnapshot` is each rule's own answer to "what on this sheet
  // is worth reporting?" — reading `cocAttributes`/`cocDerived`
  // directly handed a d20 or Triangle bot two nulls and no way to
  // learn its own stats.
  const sheetRule = getRuleForRoom(room || {});
  return {
    hasCharacterSheet: !!charData,
    sheet: charData ? sheetRule.exportSnapshot(charData) : null,
    skills: skills.map(s => ({ name: s.skillName, value: s.skillValue })),
    customAttributes: charData?.customAttributes || [],
  };
}

async function setCharacterCardTool(args: ParsedToolArgs, ctx: AgentToolContext): Promise<unknown> {
  const { roomId, botUserId, room } = ctx;
  const [memberInfo] = await db.select({
    characterData: roomMembers.characterData,
  }).from(roomMembers)
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, botUserId)
    ));

  const existing: CharacterData = memberInfo?.characterData
    ? JSON.parse(memberInfo.characterData)
    : { ruleTemplate: args.ruleTemplate || "basic" };

  const sheetRule = getRuleForRoom(room || { ruleTemplate: args.ruleTemplate as string | undefined });

  // Cap customAttributes — the schema is `{name, value, max?}[]` and
  // the model has no legitimate reason to emit dozens of them. Pre-
  // capping here keeps the persisted JSON small.
  const trimmedCustom = Array.isArray(args.customAttributes)
    ? args.customAttributes.slice(0, 30)
    : undefined;

  const merged: CharacterData = {
    ...existing,
    ...(args.ruleTemplate ? { ruleTemplate: args.ruleTemplate } : {}),
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.age !== undefined ? { age: args.age } : {}),
    ...(args.occupation !== undefined ? { occupation: args.occupation } : {}),
    ...(args.bio !== undefined ? { bio: args.bio } : {}),
    ...(trimmedCustom !== undefined ? { customAttributes: trimmedCustom } : {}),
  };

  // The model is not trusted to stay within bounds, and only the
  // rule knows its own storage bag and legal ranges — so the rule
  // that advertised these fields in `describeForAI` is also the one
  // that validates them. Branching on the rule id here is what left
  // Triangle and 狩魂者 writes silently dropped.
  Object.assign(merged, sheetRule.applySheetPatch(merged, args as Record<string, unknown>));

  // Always run derivation through the rule so future computed
  // fields (e.g. COC cocDerived recomputation, d20 HP clamp) stay
  // consistent regardless of which keys the model touched.
  Object.assign(merged, sheetRule.computeDerived(merged));

  await db.update(roomMembers)
    .set({ characterData: JSON.stringify(merged) })
    .where(and(
      eq(roomMembers.roomId, roomId),
      eq(roomMembers.userId, botUserId)
    ));

  if (args.skills && Array.isArray(args.skills)) {
    // Cap the skills list — a hallucinating model could otherwise emit
    // thousands of entries and block the tool loop on sequential
    // INSERTs. 50 covers any realistic character sheet.
    const skillsToWrite = args.skills.slice(0, 50);
    for (const skill of skillsToWrite) {
      if (typeof skill.name === "string" && typeof skill.value === "number") {
        const skillValue = clampInt(skill.value, 0, 999, 0);
        await db.insert(roomSkills).values({
          roomId,
          userId: botUserId,
          skillName: skill.name.slice(0, 64),
          skillValue,
        }).onConflictDoUpdate({
          target: [roomSkills.roomId, roomSkills.userId, roomSkills.skillName],
          set: { skillValue, updatedAt: sqlNow() },
        });
      }
    }
  }

  return { success: true };
}

export const AGENT_TOOL_HANDLERS: ReadonlyMap<string, AgentToolHandler> = new Map([
  ["roll_dice", rollDiceTool],
  ["respond_check", respondCheckTool],
  ["roll_skill_check", rollSkillCheckTool],
  ["list_members", listMembersTool],
  ["give_item", giveItemTool],
  ["reveal_clue", revealClueTool],
  ["send_image", sendImageTool],
  ["inspect_item", inspectItemTool],
  ["search_history", searchHistoryTool],
  ["my_inventory", myInventoryTool],
  ["my_clues", myCluesTool],
  ["my_character", myCharacterTool],
  ["set_character_card", setCharacterCardTool],
]);
