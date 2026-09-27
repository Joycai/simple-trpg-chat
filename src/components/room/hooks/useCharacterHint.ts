"use client";

import { useState, useEffect, useMemo } from "react";
import { getMySkillsAction } from "@/app/actions/skills";
import { getRuleForRoom, ruleUsesStructuredSheet, attributesUnset } from "@/lib/rules";
import type { CharacterData } from "@/lib/character/types";
import type { Room } from "@/components/room/types";

/**
 * "Set up your character" nudge on the 角色档案 top-bar icon. Only for rules
 * with a structured sheet (coc7th/TA/DnD/狩魂; basic/通用 d100 never hints),
 * and only for the current user. Roll-up: lights up when attributes are still
 * at their rule defaults OR the user has no skills yet. Skills are counted
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
    if (!ruleUsesStructuredSheet(rule)) return false;
    let sheet: CharacterData | null = null;
    if (characterData) {
      try { sheet = JSON.parse(characterData) as CharacterData; } catch {}
    }
    return attributesUnset(sheet, rule) || skillsEmpty;
  }, [room, characterData, skillsEmpty]);
}
