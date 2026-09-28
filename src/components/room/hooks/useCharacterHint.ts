"use client";

import { useState, useEffect, useMemo } from "react";
import { getMySkillsAction } from "@/app/actions/skills";
import { getRuleForRoom } from "@/lib/rules";
import { sheetCompletion } from "@/lib/character/completion";
import { parseSheet } from "@/lib/character/sheet-store";
import type { Room } from "@/components/room/types";

/**
 * "Set up your character" nudge on the 角色档案 top-bar icon. Only for rules
 * with a structured sheet (coc7th/TA/DnD/狩魂; basic/通用 d100 never hints),
 * and only for the current user. Roll-up: lights up while a required
 * attribute / resource is unset OR the user has no skills yet. Skills are counted
 * here (the top bar has no sheet/skill data of its own), keyed on the shared
 * skillRefreshKey so .st commands and in-panel skill edits keep it live.
 * The first value comes with the server render (initialSnapshot); only a
 * bump re-reads it.
 */
export function useCharacterHint({
  room,
  characterData,
  skillRefreshKey,
  initialSkillsEmpty,
}: {
  room: Room;
  characterData: string | null | undefined;
  skillRefreshKey: number;
  initialSkillsEmpty: boolean;
}): boolean {
  const [skillsEmpty, setSkillsEmpty] = useState(initialSkillsEmpty);
  useEffect(() => {
    if (skillRefreshKey === 0) return;
    getMySkillsAction(room.id)
      .then(s => setSkillsEmpty(s.length === 0))
      .catch(() => {});
  }, [room.id, skillRefreshKey]);

  return useMemo(() => {
    const rule = getRuleForRoom(room);
    if (rule.sheet.attributes.length === 0) return false;
    const sheet = parseSheet(characterData, rule.id);
    // A sheet built for another rule is the rule-change prompt's business.
    if (sheet.ruleTemplate !== rule.id) return false;
    const missing = sheetCompletion(rule, sheet).fields
      .some(f => f.state === "missing" && f.kind !== "skill");
    return missing || skillsEmpty;
  }, [room, characterData, skillsEmpty]);
}
