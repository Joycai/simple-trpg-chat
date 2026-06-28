"use client";

import { CharacterPanel } from "@/components/room/character/CharacterPanel";
import { RoomSettings } from "@/components/room/RoomSettings";
import { InventoryPanel } from "@/components/room/inventory/InventoryPanel";
import { BotManager } from "@/components/room/bot/BotManager";
import { AiImportPanel } from "@/components/room/bot/AiImportPanel";
import { ExportButton } from "@/components/room/ExportButton";
import { RoomInfoPanel } from "@/components/room/RoomInfoPanel";
import { HostCheckDialog } from "@/components/room/chat/HostCheckDialog";
import { SkillSetPrompt } from "@/components/room/character/SkillSetPrompt";
import { SkillPanel } from "@/components/room/character/SkillPanel";
import { UserSettingsPanel } from "@/components/user/UserSettingsPanel";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { MembersDialog } from "@/components/room/MembersDialog";
import type { Room, PlayerEntry, MentionTarget, CheckMode, PendingSkillCheck } from "@/components/room/types";
import type { ThemeId, ThemeMode } from "@/themes/types";

interface RoomOverlaysProps {
  room: Room;
  userId: number;
  isHost: boolean;
  nickname: string;
  characterData?: string | null;
  readOnly: boolean;
  players: PlayerEntry[];
  aiEnabled: boolean;
  validProviderIds: number[];
  userName: string;
  userRole: string;
  roomTheme?: ThemeId;
  roomThemeMode?: ThemeMode;
  inventoryRefreshKey: number;
  skillRefreshKey: number;
  mentionTargets: MentionTarget[];
  onlineUserIds?: Set<number>;
  playerCount: number;
  botCount: number;
  activeTab: "public" | number;

  // Viewing another player's character card
  viewingPlayerId: number | null;
  viewingPlayerNickname: string;
  viewingPlayerCharData: string | null;
  loadingPlayerCard: boolean;
  onCloseViewingPlayer: () => void;

  showCharacter: boolean;
  setShowCharacter: (v: boolean) => void;
  showBotManager: boolean;
  setShowBotManager: (v: boolean) => void;
  showAiImport: boolean;
  setShowAiImport: (v: boolean) => void;
  showMembers: boolean;
  setShowMembers: (v: boolean) => void;
  showInventory: boolean;
  setShowInventory: (v: boolean) => void;
  showItemManager: boolean;
  setShowItemManager: (v: boolean) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  showRoomInfo: boolean;
  setShowRoomInfo: (v: boolean) => void;
  showExport: boolean;
  setShowExport: (v: boolean) => void;
  showSkills: boolean;
  setShowSkills: (v: boolean) => void;
  showUserSettings: boolean;
  setShowUserSettings: (v: boolean) => void;

  checkMode: CheckMode | null;
  setCheckMode: (v: CheckMode | null) => void;

  pendingSkillCheck: PendingSkillCheck | null;
  setPendingSkillCheck: (v: PendingSkillCheck | null) => void;
  onConfirmSkillSet: (value: number) => void;

  onNicknameChange: (newNick: string) => void;
  onViewPlayerCard: (targetUserId: number, targetNickname: string) => void;
  onStartDM: (tab: "public" | number) => void;
}

/* The room's modal/overlay layer — every panel rendered on top of the chat.
   Extracted from RoomClient so the parent renders just <RoomOverlays {...} />. */
export function RoomOverlays(props: RoomOverlaysProps) {
  const {
    room, userId, isHost, nickname, characterData, readOnly, players,
    aiEnabled, validProviderIds, userName, userRole, roomTheme, roomThemeMode,
    inventoryRefreshKey, skillRefreshKey, mentionTargets, onlineUserIds, playerCount, botCount, activeTab,
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard, onCloseViewingPlayer,
    showCharacter, setShowCharacter, showBotManager, setShowBotManager, showAiImport, setShowAiImport,
    showMembers, setShowMembers, showInventory, setShowInventory, showItemManager, setShowItemManager,
    showSettings, setShowSettings, showRoomInfo, setShowRoomInfo, showExport, setShowExport,
    showSkills, setShowSkills, showUserSettings, setShowUserSettings,
    checkMode, setCheckMode, pendingSkillCheck, setPendingSkillCheck, onConfirmSkillSet,
    onNicknameChange, onViewPlayerCard, onStartDM,
  } = props;

  const memberOf = (uid: number | null) =>
    players.find((p) => (p.users?.id || p.user_id || p.user?.id) === uid)?.room_members;

  const inventoryPlayers = players.map((m) => {
    const id = (m.users?.id || m.user_id) ?? 0;
    return {
      id,
      username: m.users?.username || "",
      nickname: m.room_members?.nickname || m.nickname || "",
      isOnline: onlineUserIds?.has(id) ?? false,
      avatarColor: m.room_members?.avatarColor ?? null,
      isBot: !!(m.users?.isBot || m.user?.isBot),
    };
  });

  return (
    <>
      {showCharacter && (
        <CharacterPanel
          roomId={room.id}
          userId={userId}
          currentNickname={nickname}
          characterData={characterData}
          roomRuleTemplate={room.ruleTemplate || "basic"}
          onClose={() => setShowCharacter(false)}
          onNicknameChange={onNicknameChange}
          readOnly={readOnly}
          refreshKey={skillRefreshKey}
          avatarColor={memberOf(userId)?.avatarColor}
          avatar={memberOf(userId)?.avatar}
        />
      )}
      {viewingPlayerId !== null && (
        <CharacterPanel
          roomId={room.id}
          userId={viewingPlayerId}
          currentNickname={viewingPlayerNickname}
          characterData={viewingPlayerCharData}
          roomRuleTemplate={room.ruleTemplate || "basic"}
          onClose={onCloseViewingPlayer}
          onNicknameChange={() => {}}
          readOnly={true}
          targetUserId={viewingPlayerId}
          loading={loadingPlayerCard}
          avatarColor={memberOf(viewingPlayerId)?.avatarColor}
          avatar={memberOf(viewingPlayerId)?.avatar}
          isGM={isHost}
        />
      )}
      {showBotManager && (
        <BotManager roomId={room.id} isHost={isHost} onClose={() => setShowBotManager(false)} aiEnabled={aiEnabled} validProviderIds={validProviderIds} />
      )}
      {showAiImport && (
        <AiImportPanel roomId={room.id} onClose={() => setShowAiImport(false)} />
      )}
      {checkMode && (
        <HostCheckDialog
          roomId={room.id}
          mode={checkMode}
          players={activeTab === "public" ? mentionTargets : mentionTargets.filter(p => p.id === activeTab)}
          isPrivate={activeTab !== "public"}
          channelTargetUserId={activeTab !== "public" ? activeTab : undefined}
          onClose={() => setCheckMode(null)}
        />
      )}
      {pendingSkillCheck && (
        <SkillSetPrompt
          skillName={pendingSkillCheck.skillName}
          onConfirm={onConfirmSkillSet}
          onClose={() => setPendingSkillCheck(null)}
        />
      )}
      {showMembers && (
        <MembersDialog
          players={players}
          userId={userId}
          hostId={room.hostId}
          isHost={isHost}
          aiEnabled={aiEnabled}
          validProviderIds={validProviderIds}
          playerCount={playerCount}
          botCount={botCount}
          onViewPlayerCard={onViewPlayerCard}
          onStartDM={onStartDM}
          onClose={() => setShowMembers(false)}
        />
      )}
      {showInventory && (
        <InventoryPanel view="backpack" roomId={room.id} userId={userId} isHost={isHost} hostId={room.hostId} refreshKey={inventoryRefreshKey} players={inventoryPlayers} onClose={() => setShowInventory(false)} readOnly={readOnly} />
      )}
      {showItemManager && isHost && (
        <InventoryPanel view="manage" roomId={room.id} userId={userId} isHost={isHost} hostId={room.hostId} refreshKey={inventoryRefreshKey} players={inventoryPlayers} onClose={() => setShowItemManager(false)} readOnly={readOnly} />
      )}
      {showSettings && (
        <RoomSettings roomId={room.id} roomName={room.name} currentTheme={roomTheme || "default"} currentThemeMode={roomThemeMode || "auto"} currentRuleTemplate={room.ruleTemplate || "basic"} onClose={() => setShowSettings(false)} />
      )}
      {showRoomInfo && (
        <RoomInfoPanel room={{ ...room, ruleTemplate: room.ruleTemplate ?? "basic", createdAt: room.createdAt ?? "" }} isHost={isHost} userId={userId} onClose={() => setShowRoomInfo(false)} />
      )}
      {showExport && (
        <OverlayShell onClose={() => setShowExport(false)} panelClassName="max-w-md w-full mx-4">
          {() => <ExportButton roomId={room.id} roomName={room.name} />}
        </OverlayShell>
      )}
      {showSkills && (
        <SkillPanel roomId={room.id} userId={userId} onClose={() => setShowSkills(false)} readOnly={readOnly} refreshKey={skillRefreshKey} />
      )}
      {showUserSettings && (
        <UserSettingsPanel userName={userName} userRole={userRole} onClose={() => setShowUserSettings(false)} />
      )}
    </>
  );
}
