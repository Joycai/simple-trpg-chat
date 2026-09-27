"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRoomSkills, getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import type { SkillItem } from "@/components/room/character/SkillsTab";

/**
 * The panel's 技能 tab: the viewer's skills (or, read-only, the target's),
 * reloaded on the parent's `refreshKey` bump, plus add / remove / edit.
 * `onSkillsChanged` lets the room refresh its own skill-derived state.
 */
export function useCharacterSkills({
  roomId,
  readOnly,
  targetUserId,
  refreshKey,
  afterEnter,
  onSkillsChanged,
}: {
  roomId: number;
  readOnly: boolean;
  targetUserId: number | undefined;
  refreshKey: number;
  afterEnter: (fn: () => void) => void;
  onSkillsChanged: (() => void) | undefined;
}) {
  const router = useRouter();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillValue, setNewSkillValue] = useState(50);

  useEffect(() => {
    if (readOnly && targetUserId) {
      getRoomSkills(roomId, targetUserId).then((data) => {
        afterEnter(() => {
          setSkills(data.map(s => ({ id: s.id, skillName: s.skillName, skillValue: s.skillValue })));
          setSkillsLoaded(true);
        });
      }).catch(() => {});
    } else {
      getMySkillsAction(roomId).then((data) => {
        afterEnter(() => { setSkills(data); setSkillsLoaded(true); });
      }).catch(() => {});
    }
  }, [roomId, readOnly, targetUserId, refreshKey, afterEnter]);

  const addSkill = async () => {
    if (!newSkillName.trim()) return;
    await upsertSkillAction(roomId, newSkillName.trim(), newSkillValue);
    setNewSkillName("");
    router.refresh();
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
    onSkillsChanged?.();
  };

  const removeSkill = async (skillId: number) => {
    await deleteSkillAction(roomId, skillId);
    router.refresh();
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
    onSkillsChanged?.();
  };

  // Inline value edit — upsert overwrites by (room, user, name), same as .st.
  const updateSkill = async (skillName: string, value: number) => {
    await upsertSkillAction(roomId, skillName, value);
    router.refresh();
    getMySkillsAction(roomId).then(setSkills).catch(() => {});
    onSkillsChanged?.();
  };

  return {
    skills, skillsLoaded, newSkillName, setNewSkillName, newSkillValue, setNewSkillValue,
    addSkill, removeSkill, updateSkill,
  };
}
