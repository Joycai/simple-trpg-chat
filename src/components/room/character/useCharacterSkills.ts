"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getRoomSkills, getMySkillsAction, upsertSkillAction, deleteSkillAction } from "@/app/actions/skills";
import type { SkillItem } from "@/components/room/character/SkillsTab";
import type { Done } from "@/lib/actions/result";
import { tabId } from "@/lib/ui/tab-id";

/** The card owner's skills: the viewer's own, or another member's. */
function fetchSkills(roomId: number, targetUserId: number | undefined): Promise<SkillItem[]> {
  return targetUserId
    ? getRoomSkills(roomId, targetUserId).then((data) => data.map(s => ({ id: s.id, skillName: s.skillName, skillValue: s.skillValue })))
    : getMySkillsAction(roomId);
}

/**
 * The panel's 技能 tab: the skills of the card's owner — the viewer's own, or
 * `targetUserId`'s when the panel shows another member (a host may edit
 * them; the server enforces who may) — reloaded on the parent's `refreshKey`
 * bump, plus add / remove / edit. `onSkillsChanged` lets the room refresh its
 * own skill-derived state; `onError` receives a failed write's message.
 */
export function useCharacterSkills({
  roomId,
  targetUserId,
  refreshKey,
  afterEnter,
  onSkillsChanged,
  onError,
}: {
  roomId: number;
  /** Another member's id; undefined for the viewer's own card. */
  targetUserId: number | undefined;
  refreshKey: number;
  afterEnter: (fn: () => void) => void;
  onSkillsChanged: (() => void) | undefined;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);

  useEffect(() => {
    fetchSkills(roomId, targetUserId).then((data) => {
      afterEnter(() => { setSkills(data); setSkillsLoaded(true); });
    }).catch(() => {});
  }, [roomId, targetUserId, refreshKey, afterEnter]);

  const afterWrite = async (write: Promise<Done>) => {
    const res = await write.catch(() => ({ success: false as const, error: tCommon("error") }));
    if (!res.success) { onError(res.error); return false; }
    router.refresh();
    fetchSkills(roomId, targetUserId).then(setSkills).catch(() => {});
    onSkillsChanged?.();
    return true;
  };

  // Own skills: `afterWrite` refreshes all this tab shows of them, so it skips
  // its own `character_updated`. A host editing someone else's lets the event
  // reload the overview and the member's other views.
  const origin = targetUserId === undefined ? tabId() : undefined;

  // Add or overwrite by (room, user, name), same as .st.
  const setSkill = (skillName: string, value: number) =>
    afterWrite(upsertSkillAction(roomId, skillName, value, targetUserId, origin));

  const removeSkill = async (skillId: number) => {
    await afterWrite(deleteSkillAction(roomId, skillId, targetUserId, origin));
  };

  return { skills, skillsLoaded, setSkill, removeSkill };
}
