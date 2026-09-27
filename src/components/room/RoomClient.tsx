"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { ConversationPanel } from "@/components/room/chat/ConversationPanel";
import { RoomTopBar } from "@/components/room/RoomTopBar";
import { RoomBackground } from "@/components/room/RoomBackground";
import { ChatArea } from "@/components/room/chat/ChatArea";
import { RoomOverlays } from "@/components/room/RoomOverlays";
import { useRoomEvents } from "@/components/room/hooks/useRoomEvents";
import { useSidebar } from "@/components/room/hooks/useSidebar";
import { useChatScroll } from "@/components/room/hooks/useChatScroll";
import { useUnreadDmCounts } from "@/components/room/hooks/useUnreadDmCounts";
import { useCharacterHint } from "@/components/room/hooks/useCharacterHint";
import { useRoomEventsData } from "@/components/room/hooks/useRoomEventsData";
import { useUnreadInventoryCount } from "@/components/room/hooks/useUnreadInventoryCount";
import { useRoomThemeMode } from "@/components/room/hooks/useRoomThemeMode";
import { usePlayerCardViewer } from "@/components/room/hooks/usePlayerCardViewer";
import { useCheckFlow } from "@/components/room/hooks/useCheckFlow";
import { useRoomNameEditor } from "@/components/room/hooks/useRoomNameEditor";
import { useChatSend } from "@/components/room/hooks/useChatSend";
import { useRoomShortcuts } from "@/components/room/hooks/useRoomShortcuts";
import { useMessageLog } from "@/components/room/hooks/useMessageLog";
import { useLivePlayers } from "@/components/room/hooks/useLivePlayers";
import { RoomHotkeyHelp } from "@/components/room/RoomHotkeyHelp";
import { HotkeyHintToast, hotkeyHintStore } from "@/components/room/HotkeyHintToast";
import { SidebarBackdrop, SidebarResizeHandle } from "@/components/room/SidebarControls";
import { EventDataProvider } from "@/components/room/event/EventDataContext";
import { useTranslations } from "next-intl";
import { buildMentionTargets, buildDmConversations, totalUnread } from "@/lib/room/mention-targets";
import type { RoomClientProps, ConnectionStatus, TypingBots } from "@/components/room/types";
import { channelOf } from "@/lib/messaging/audience";
import { getRuleForRoom, type StatusEntry } from "@/lib/rules";
import { RuleTemplateProvider } from "@/components/shared/host-label";

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomThemeMode,
  initialTimelineMode,
  players: initialPlayers = [],
  characterData,
  aiEnabled = false,
  validProviderIds = [],
  userName,
  userRole,
  backgroundUrl = null,
  isObserver = false,
  initialSnapshot,
}: RoomClientProps) {
  const t = useTranslations("room");
  // Loaded messages + the seen-id / live-arrival / latest-list refs.
  const { messages, setMessages, seenIdsRef, liveEnterRef, messagesRef } = useMessageLog(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  // Members, patched by SSE and re-seeded on each server render.
  const { players, setPlayers } = useLivePlayers(initialPlayers);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showItemManager, setShowItemManager] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showEventManage, setShowEventManage] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHotkeyHelp, setShowHotkeyHelp] = useState(false);
  const openHotkeyHelp = useCallback(() => {
    hotkeyHintStore.markSeen();
    setShowHotkeyHelp(true);
  }, []);
  // Inline room-name editing (host only, top bar)
  const { editingRoomName, setEditingRoomName, roomNameDraft, setRoomNameDraft, savingRoomName, handleSaveRoomName } =
    useRoomNameEditor(room);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const { unreadCounts, setUnreadCounts, markTabRead } = useUnreadDmCounts(room.id, initialSnapshot.unreadDms);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  // Live overrides pushed by SSE, keyed by userId — one entry per member,
  // holding the rule's primary vital (HP where the rule has one).
  const [characterResources, setCharacterResources] = useState<Map<number, StatusEntry>>(new Map());
  const [typingBots, setTypingBots] = useState<TypingBots>({});

  // Conversation sidebar (width / collapsed / mobile + drag-to-resize).
  const {
    width: sidebarWidth,
    collapsed: sidebarCollapsed,
    resizing: sidebarResizing,
    hydrated: sidebarHydrated,
    isMobile,
    setCollapsed: setSidebarCollapsed,
    toggleCollapsed: toggleSidebar,
    resetWidth: resetSidebarWidth,
    handleResizeStart,
  } = useSidebar();

  // Frozen rooms are read-only for players; the host can still operate.
  // Admin observers (viewing a room they haven't joined) are always read-only.
  const readOnly = (!!room.frozen && !isHost) || isObserver;


  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const handleTabChange = useCallback((tab: "public" | number) => {
    setActiveTab(tab);
    if (tab !== "public") markTabRead(tab);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [markTabRead, isMobile, setSidebarCollapsed]);

  // Mention targets (players + bots, excluding self), the DM list and its
  // badge total — pure derivations in lib/room/mention-targets.
  const mentionTargets = useMemo(
    () => buildMentionTargets(players || [], userId, aiEnabled, validProviderIds),
    [players, userId, aiEnabled, validProviderIds],
  );
  const dmConversations = useMemo(
    () => buildDmConversations(mentionTargets, unreadCounts, onlineUserIds, characterResources),
    [mentionTargets, unreadCounts, onlineUserIds, characterResources],
  );
  const totalUnreadCount = useMemo(() => totalUnread(unreadCounts), [unreadCounts]);

  // Capabilities drive every rule-specific UI gate (TopBar check menu,
  // tooltips, host-only buttons). Looked up once per render so child props
  // stay stable.
  const ruleCapabilities = getRuleForRoom(room).capabilities;

  // "Set up your character" nudge on the 角色档案 top-bar icon.
  const characterHint = useCharacterHint({
    room,
    characterData,
    skillRefreshKey,
    initialSkillsEmpty: initialSnapshot.skillsEmpty,
  });

  // Events for this viewer: the EventDataContext list, the chat-card unlock
  // set, the top-bar badge and the open detail modal.
  const {
    eventsRefreshKey, setEventsRefreshKey,
    visibleEventIds, unreadEvents,
    eventDetailId, setEventDetailId, handleOpenEvent,
    bumpEvents, refreshEventBadge, eventData,
  } = useRoomEventsData({
    roomId: room.id,
    initialEvents: initialSnapshot.events,
    initialUnreadEvents: initialSnapshot.unreadEvents,
    inventoryRefreshKey,
  });

  const bumpSkills = useCallback(() => setSkillRefreshKey(k => k + 1), []);

  const botCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => p.users?.isBot).length;
  const playerCount = (players || []).filter((p: { users?: { isBot?: boolean } }) => !p.users?.isBot).length;

  // Live "online" count: non-bot members with an active SSE connection, plus
  // self (always online as the viewer). Single source of truth shared by the
  // top bar and the left roster panel so their "X 在线" labels stay in sync —
  // presence lives in `onlineUserIds` (SSE presence_update), not the roster.
  const onlineCount = useMemo(
    () =>
      (players || []).filter((p: { users?: { id?: number; isBot?: boolean }; user?: { id?: number; isBot?: boolean }; user_id?: number }) => {
        const u = p.users || p.user;
        const id = u?.id ?? p.user_id;
        return !u?.isBot && (id === userId || onlineUserIds.has(id ?? -1));
      }).length,
    [players, onlineUserIds, userId]
  );

  // Bucket each visible message into its channel/tab. `messages` already only
  // contains rows this viewer may see (filtered by the SSE route + initial query),
  // so we just route by audience: channelOf returns "public" (everyone/self/
  // directed/gm render inline there) or the DM partner's userId.
  const tabMessages = useMemo(() => {
    return messages.filter(m => channelOf(m, userId) === activeTab);
  }, [messages, activeTab, userId]);

  const statusRef = useRef(status);

  useEffect(() => { statusRef.current = status; }, [status]);

  // Backpack badge: seeded from the page, recounted on later item messages.
  const { unreadItems, setUnreadItems } = useUnreadInventoryCount({
    roomId: room.id,
    initialUnread: initialSnapshot.unreadItems,
    initialMessages,
    messages,
  });

  // Stick-to-bottom, the back-to-bottom button, older-page loading and the
  // in-memory window cap.
  const { scrollRef, handleScroll, showScrollButton, scrollToBottom } = useChatScroll({
    roomId: room.id,
    initialCount: initialMessages.length,
    messagesRef,
    messagesLength: messages.length,
    seenIdsRef,
    setMessages,
    tabMessages,
    typingBots,
  });

  // Single SSE connection: routes inbound events into the right state setter.
  useRoomEvents({
    roomId: room.id,
    userId,
    isHost,
    activeTabRef,
    seenIdsRef,
    liveEnterRef,
    messagesRef,
    setMessages,
    setPlayers,
    setStatus,
    setUnreadCounts,
    setTypingBots,
    setInventoryRefreshKey,
    setEventsRefreshKey,
    setOnlineUserIds,
    setCharacterResources,
  });

  // Light/dark for the room (configured, or following the timeline).
  useRoomThemeMode({ room, messages, initialTimelineMode });

  // Sending (messages, dice, commands, divider withdrawal) and the two helpers
  // the check flow shares: local error rows and the self-sheet refresh.
  const { pushLocalError, refreshSelfSheet, handleSendMessage, handleWithdrawTimeline } = useChatSend({
    roomId: room.id,
    userId,
    activeTab,
    seenIdsRef,
    liveEnterRef,
    setMessages,
    setSkillRefreshKey,
  });

  // Another member's card, read-only; opening one closes the members panel.
  const closeMembers = useCallback(() => setShowMembers(false), []);
  const {
    viewingPlayerId, viewingPlayerNickname, viewingPlayerCharData, loadingPlayerCard,
    handleViewPlayerCard, closeViewingPlayer,
  } = usePlayerCardViewer(room.id, closeMembers);

  // Check requests, the 加骰 / set-skill prompts, host proxy rolls, and the
  // top-bar check dialog/menu.
  const {
    checkMode, setCheckMode, showCheckMenu, setShowCheckMenu,
    pendingSkillCheck, setPendingSkillCheck, pendingBonusDice, setPendingBonusDice,
    handleCheckRequest, handleConfirmBonusDice, handleProxyCheckRequest, loadProxyTargets, handleConfirmSkillSet,
  } = useCheckFlow({ roomId: room.id, userId, pushLocalError, refreshSelfSheet });

  // Stable identity matters: this reaches every ChatMessage via ChatArea, and
  // one unstable prop defeats the whole list's memo() bail-out.
  const handleToggleInventory = useCallback(() => {
    setShowInventory((v) => !v);
    // Clear only the local unread dot here. The server-side "viewed" flags are
    // acknowledged by the InventoryPanel *after* it loads, so the new/updated
    // highlights still render this session instead of being cleared mid-open.
    setUnreadItems(0);
  }, [setUnreadItems]); // a state setter: stable, so this callback still is

  // Room-wide keyboard shortcuts (bindings in src/lib/ui/hotkeys.ts).
  useRoomShortcuts({
    isHost, readOnly, checkMenuModes: ruleCapabilities.checkMenuModes,
    activeTab, tabPartners: dmConversations, onTabChange: handleTabChange,
    toggleInventory: handleToggleInventory, toggleSidebar,
    setShowCharacter, setShowNotebook, setShowEvents, setShowItemManager, setShowTimeline,
    setShowHotkeyHelp, setShowCheckMenu, setCheckMode, setShowSystemMenu, setShowAiMenu,
  });

  return (
    <RuleTemplateProvider ruleTemplate={room.ruleTemplate}>
    <EventDataProvider value={eventData}>
    <div className="flex flex-col h-dvh bg-bg overflow-hidden text-text">
      {/* Ambient background: fixed z-0 layers above the root's opaque bg-bg,
          below the top bar (z-20) and the positioned content row below. */}
      <RoomBackground url={backgroundUrl} />
      <RoomTopBar
        room={room}
        isHost={isHost}
        nickname={nickname}
        status={status}
        checkMenuModes={ruleCapabilities.checkMenuModes}
        hasBackground={!!backgroundUrl}
        playerCount={playerCount}
        onlineCount={onlineCount}
        botCount={botCount}
        sidebarCollapsed={sidebarCollapsed}
        totalUnread={totalUnreadCount}
        onToggleSidebar={toggleSidebar}
        editingRoomName={editingRoomName}
        roomNameDraft={roomNameDraft}
        savingRoomName={savingRoomName}
        setRoomNameDraft={setRoomNameDraft}
        setEditingRoomName={setEditingRoomName}
        onSaveRoomName={handleSaveRoomName}
        showCharacter={showCharacter}
        setShowCharacter={setShowCharacter}
        characterHint={characterHint}
        showInventory={showInventory}
        unreadItems={unreadItems}
        onToggleInventory={handleToggleInventory}
        showNotebook={showNotebook}
        setShowNotebook={setShowNotebook}
        showEvents={showEvents}
        setShowEvents={setShowEvents}
        unreadEvents={unreadEvents}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        showCheckMenu={showCheckMenu}
        setShowCheckMenu={setShowCheckMenu}
        showItemManager={showItemManager}
        setShowItemManager={setShowItemManager}
        setShowEventManage={setShowEventManage}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        showAiMenu={showAiMenu}
        setShowAiMenu={setShowAiMenu}
        setShowAiImport={setShowAiImport}
        setShowBotManager={setShowBotManager}
        showSystemMenu={showSystemMenu}
        setShowSystemMenu={setShowSystemMenu}
        setShowMembers={setShowMembers}
        setShowRoomInfo={setShowRoomInfo}
        setShowExport={setShowExport}
        setShowSettings={setShowSettings}
        setShowUserSettings={setShowUserSettings}
        setShowHotkeyHelp={(v) => {
          hotkeyHintStore.markSeen();
          setShowHotkeyHelp(v);
        }}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Conversation TAB (Task #43) */}
        <ConversationPanel
          activeTab={activeTab}
          onTabChange={handleTabChange}
          dmConversations={dmConversations}
          onlineCount={onlineCount}
          onStartDM={handleTabChange}
          onViewCard={handleViewPlayerCard}
          isHost={isHost}
          roomId={room.id}
          userId={userId}
          hostId={room.hostId}
          width={sidebarWidth}
          collapsed={sidebarCollapsed}
          resizing={sidebarResizing || !sidebarHydrated}
        />

        {isMobile && <SidebarBackdrop collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed(true)} />}
        {!sidebarCollapsed && !isMobile && (
          <SidebarResizeHandle
            onResizeStart={handleResizeStart}
            onResetWidth={resetSidebarWidth}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Main Content: Chat Area */}
        <ChatArea
          scrollRef={scrollRef}
          onScroll={handleScroll}
          tabMessages={tabMessages}
          liveEnterRef={liveEnterRef}
          players={players}
          userId={userId}
          isHost={isHost}
          roomId={room.id}
          hostId={room.hostId}
          typingBots={typingBots}
          activeTab={activeTab}
          showScrollButton={showScrollButton}
          scrollToBottom={scrollToBottom}
          dmConversations={dmConversations}
          mentionTargets={mentionTargets}
          readOnly={readOnly}
          readOnlyNotice={isObserver ? t("observerNotice") : undefined}
          quickCommands={ruleCapabilities.quickRolls}
          defaultRollExpression={ruleCapabilities.defaultRollExpression}
          onViewCharacter={handleViewPlayerCard}
          onStartDM={handleTabChange}
          onCheckRequest={handleCheckRequest}
          onProxyCheckRequest={isHost ? handleProxyCheckRequest : undefined}
          onLoadProxyTargets={isHost ? loadProxyTargets : undefined}
          onOpenInventory={handleToggleInventory}
          onWithdrawTimeline={isHost ? handleWithdrawTimeline : undefined}
          onSendMessage={handleSendMessage}
          visibleEventIds={visibleEventIds}
          onOpenEvent={handleOpenEvent}
        />
      </div>

      <RoomOverlays
        room={room}
        userId={userId}
        isHost={isHost}
        nickname={nickname}
        characterData={characterData}
        readOnly={readOnly}
        players={players}
        aiEnabled={aiEnabled}
        validProviderIds={validProviderIds}
        userName={userName}
        userRole={userRole}
        roomTheme={roomTheme}
        roomThemeMode={roomThemeMode}
        inventoryRefreshKey={inventoryRefreshKey}
        skillRefreshKey={skillRefreshKey}
        onSkillsChanged={bumpSkills}
        mentionTargets={mentionTargets}
        onlineUserIds={onlineUserIds}
        playerCount={playerCount}
        botCount={botCount}
        activeTab={activeTab}
        viewingPlayerId={viewingPlayerId}
        viewingPlayerNickname={viewingPlayerNickname}
        viewingPlayerCharData={viewingPlayerCharData}
        loadingPlayerCard={loadingPlayerCard}
        onCloseViewingPlayer={closeViewingPlayer}
        showCharacter={showCharacter}
        setShowCharacter={setShowCharacter}
        showBotManager={showBotManager}
        setShowBotManager={setShowBotManager}
        showAiImport={showAiImport}
        setShowAiImport={setShowAiImport}
        showMembers={showMembers}
        setShowMembers={setShowMembers}
        showInventory={showInventory}
        setShowInventory={setShowInventory}
        showNotebook={showNotebook}
        setShowNotebook={setShowNotebook}
        showItemManager={showItemManager}
        setShowItemManager={setShowItemManager}
        showEvents={showEvents}
        setShowEvents={setShowEvents}
        showEventManage={showEventManage}
        setShowEventManage={setShowEventManage}
        eventsRefreshKey={eventsRefreshKey}
        onEventsChanged={bumpEvents}
        onEventBadgeChanged={refreshEventBadge}
        eventDetailId={eventDetailId}
        setEventDetailId={setEventDetailId}
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        showRoomInfo={showRoomInfo}
        setShowRoomInfo={setShowRoomInfo}
        showExport={showExport}
        setShowExport={setShowExport}
        showUserSettings={showUserSettings}
        setShowUserSettings={setShowUserSettings}
        checkMode={checkMode}
        setCheckMode={setCheckMode}
        pendingSkillCheck={pendingSkillCheck}
        setPendingSkillCheck={setPendingSkillCheck}
        onConfirmSkillSet={handleConfirmSkillSet}
        pendingBonusDice={pendingBonusDice}
        setPendingBonusDice={setPendingBonusDice}
        onConfirmBonusDice={handleConfirmBonusDice}
        onNicknameChange={(newNick) => setNickname(newNick)}
        onViewPlayerCard={handleViewPlayerCard}
        onStartDM={handleTabChange}
      />

      <HotkeyHintToast onOpenHelp={openHotkeyHelp} />


      {showHotkeyHelp && (
        <RoomHotkeyHelp isHost={isHost} onClose={() => setShowHotkeyHelp(false)} />
      )}
    </div>
    </EventDataProvider>
    </RuleTemplateProvider>
  );
}
