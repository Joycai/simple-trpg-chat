"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { CharacterPanel } from "./CharacterPanel";
import { RoomSettings } from "./RoomSettings";
import { InventoryPanel } from "./InventoryPanel";
import { BotManager } from "./BotManager";
import { ConversationPanel } from "./ConversationPanel";
import { HostCheckDialog } from "./HostCheckDialog";
import { sendMessageAction, updateNicknameAction, rollDiceAction, executeCommandAction, markDMReadAction } from "@/app/actions/room";
import { getUnreadInventoryCountAction, markInventoryViewedAction } from "@/app/actions/inventory";
import { upsertSkillAction, getMySkillsAction } from "@/app/actions/skills";
import { useTranslations } from "next-intl";
import type { ThemeId } from "@/themes/types";
import Link from "next/link";

interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
  theme: string;
}

interface Message {
  id: number;
  roomId: number;
  userId: number;
  targetUserId?: number | null;
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request";
  diceDetail: string | null;
  isPrivate: boolean;
  createdAt: string;
}

interface RoomClientProps {
  room: Room;
  messages: Message[];
  userId: number;
  isHost: boolean;
  currentNickname: string;
  roomTheme?: ThemeId;
  roomDiceRules?: string;
  players?: any[];
  characterData?: string | null;
}

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomDiceRules,
  players = [],
  characterData,
}: RoomClientProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacter, setShowCharacter] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showCheckDialog, setShowCheckDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"public" | number>("public");
  const [unreadItems, setUnreadItems] = useState(0);

  // Build mention targets (players + bots, excluding self)
  const mentionTargets = useMemo(() => {
    return (players || [])
      .filter((p: any) => (p.users?.id || p.user_id) !== userId)
      .map((p: any) => ({
        id: p.users?.id || p.user_id,
        nickname: p.room_members?.nickname || p.users?.displayName || `#${p.users?.id || p.user_id}`,
        isBot: !!p.users?.isBot,
      }));
  }, [players, userId]);

  // Build DM conversations
  const dmConversations = useMemo(() => {
    return mentionTargets.map(p => ({
      userId: p.id,
      nickname: p.nickname,
      isBot: p.isBot,
      unread: 0,
    }));
  }, [mentionTargets]);

  const botCount = (players || []).filter((p: any) => p.users?.isBot).length;
  const playerCount = (players || []).filter((p: any) => !p.users?.isBot).length;

  // Filter messages by active tab (Task #43)
  const tabMessages = useMemo(() => {
    if (activeTab === "public") {
      // Show non-private messages
      return messages.filter(m => !m.isPrivate);
    }
    // Show private messages between current user and active target
    return messages.filter(m => 
      m.isPrivate && 
      (
        (m.userId === userId && m.targetUserId === activeTab) ||
        (m.userId === activeTab && m.targetUserId === userId)
      )
    );
  }, [messages, activeTab, userId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const statusRef = useRef(status);
  const isAtBottomRef = useRef(true);

  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    getUnreadInventoryCountAction(room.id).then(setUnreadItems).catch(() => {});
  }, [room.id]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "system" && lastMsg.content.includes("道具")) {
      getUnreadInventoryCountAction(room.id).then(setUnreadItems).catch(() => {});
    }
  }, [messages, room.id]);

  const scrollToBottom = (smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
      isAtBottomRef.current = true;
      setShowScrollButton(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 150; 
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [tabMessages]); // Re-scroll when switching tabs

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    const setupSSE = () => {
      if (sseRef.current) sseRef.current.close();
      setStatus("connecting");
      const es = new EventSource(`/api/rooms/${room.id}/events`);
      sseRef.current = es;
      es.onopen = () => setStatus("connected");
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id) {
            if (data.isPrivate) {
              const isSender = data.userId === userId;
              const isTarget = data.targetUserId === userId;
              if (data.targetUserId) {
                if (!isSender && !isTarget) return;
              } else {
                if (!isSender && !isHost) return;
              }
            }
            setMessages((prev) => {
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data];
            });
          }
        } catch { /* */ }
      };
      es.onerror = () => {
        setStatus("error");
        es.close();
        reconnectTimeout = setTimeout(setupSSE, 3000);
      };
    };
    setupSSE();
    return () => {
      if (sseRef.current) sseRef.current.close();
      clearTimeout(reconnectTimeout);
    };
  }, [room.id, userId, isHost]);

  const handleSendMessage = async (
    content: string, 
    type: "text" | "dice", 
    diceDetail?: string, 
    isPrivate?: boolean,
    targetUserId?: number
  ) => {
    // Override isPrivate and targetUserId if we are in a DM tab
    let finalIsPrivate = isPrivate;
    let finalTargetId = targetUserId;
    
    if (activeTab !== "public") {
      finalIsPrivate = true;
      finalTargetId = activeTab;
    }

    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(room.id, userId, content);
        if (!result.success && result.error) {
          const errorMsg = {
            id: Date.now(), roomId: room.id, userId, nickname: "SYSTEM",
            content: `❌ 指令错误: ${result.error}`,
            type: "system" as const, isPrivate: true, diceDetail: null,
            createdAt: new Date().toISOString()
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (e) { console.error(e); }
      return;
    }
    try {
      if (type === "dice" && diceDetail) {
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        await rollDiceAction(room.id, faces, detail.count, finalIsPrivate);
      } else {
        // Optimistic update: show message immediately
        const optimistic = {
          id: Date.now(),
          roomId: room.id,
          userId,
          nickname,
          content,
          type: type as "text" | "dice" | "system",
          diceDetail: diceDetail || null,
          isPrivate: finalIsPrivate,
          targetUserId: finalTargetId,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic as any]);

        await sendMessageAction(room.id, content, type, diceDetail, finalIsPrivate, finalTargetId);
      }
    } catch (e) { console.error(e); }
  };

  const handleNicknameSave = async (newNickname: string) => {
    await updateNicknameAction(room.id, newNickname);
    setNickname(newNickname);
  };

  const handleCheckRequest = (skillName: string, diceType: string) => {
    getMySkillsAction(room.id).then(async (skills) => {
      const skill = skills.find((s: any) => s.skillName === skillName);
      if (skill) {
        if (diceType === "d100") {
          await executeCommandAction(room.id, userId, `.rc ${skillName}`);
        } else {
          const faces = parseInt(diceType.replace("d", ""));
          await rollDiceAction(room.id, faces, 1);
        }
      } else {
        const value = prompt(`你尚未设置技能【${skillName}】。请输入技能数值（1-99）：`, "50");
        if (value && !isNaN(parseInt(value))) {
          const v = parseInt(value);
          await upsertSkillAction(room.id, skillName, v);
          if (diceType === "d100") {
            await executeCommandAction(room.id, userId, `.rc ${skillName}`);
          } else {
            const faces = parseInt(diceType.replace("d", ""));
            await rollDiceAction(room.id, faces, 1);
          }
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden text-text">
      <header className="bg-header-bg border-b border-header-border shadow-sm px-4 py-3 shrink-0 z-20 relative">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-text-muted hover:text-text transition text-sm">{tn("lobby")}</Link>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-text leading-none">{room.name}</h2>
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-accent animate-pulse' : 'bg-danger'}`} title={status} />
              </div>
              <div className="text-[10px] text-text-dim mt-1 uppercase tracking-wider font-mono">{tn("roomId", { id: room.id })}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isHost && (
              <button onClick={() => setShowBotManager(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm">
                <span className="text-base">🤖</span>
                <span className="text-xs font-bold hidden sm:inline">Bot</span>
              </button>
            )}
            <button onClick={() => setShowMembers(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm" title="在线成员">
              <span className="text-base">👥</span>
              <span className="text-xs font-bold hidden sm:inline">{playerCount + botCount}</span>
            </button>
            <button onClick={() => { setShowInventory(true); markInventoryViewedAction(room.id); setUnreadItems(0); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm relative">
              <span className="text-base">📦</span>
              <span className="text-xs font-bold hidden sm:inline">道具</span>
              {unreadItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                  {unreadItems > 9 ? "9+" : unreadItems}
                </span>
              )}
            </button>
            {isHost && (
              <button onClick={() => setShowCheckDialog(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent hover:text-accent-hover transition-all duration-200 border border-accent/30 shadow-sm" title="发起检定">
                <span className="text-base">🎯</span>
                <span className="text-xs font-bold hidden sm:inline">检定</span>
              </button>
            )}
            <button onClick={() => setShowCharacter(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm">
              <span className="text-base">👤</span>
              <span className="text-xs font-bold hidden sm:inline">{nickname}</span>
            </button>
            {isHost && (
              <>
                <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm" title="房间设置">
                  <span className="text-lg leading-none">⚙️</span>
                </button>
                <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold">{t("gm")}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Conversation TAB (Task #43) */}
        <ConversationPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          dmConversations={dmConversations}
          onStartDM={() => setShowMembers(true)}
          roomId={room.id}
          userId={userId}
        />

        {/* Main Content: Chat Area */}
        <div className="flex-1 flex flex-col relative">
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
            <div className="max-w-4xl mx-auto flex flex-col gap-1">
              {tabMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  nickname={msg.nickname}
                  content={msg.content}
                  type={msg.type as any}
                  diceDetail={msg.diceDetail}
                  isPrivate={msg.isPrivate}
                  createdAt={msg.createdAt}
                  isOwn={msg.userId === userId}
                  userId={userId}
                  onCheckRequest={handleCheckRequest}
                  isBot={!!players.find((p: any) => (p.users?.id || p.user_id || p.user?.id) === msg.userId)?.users?.isBot}
                />
              ))}
              {tabMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 py-20">
                  <span className="text-4xl mb-4">{activeTab === "public" ? "🏠" : "🔒"}</span>
                  <p>{activeTab === "public" ? "公频尚无消息" : "开始你们的秘密谈话吧"}</p>
                </div>
              )}
            </div>
          </div>

          {showScrollButton && (
            <button onClick={() => scrollToBottom(true)} className="absolute bottom-28 right-8 z-10 bg-scroll-btn hover:opacity-90 text-white w-10 h-10 rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 group" title={t("scrollToBottom")}>
              <span className="text-xl group-hover:animate-bounce">↓</span>
            </button>
          )}

          <div className="bg-surface-alt border-t border-border px-4 py-3 shrink-0">
            <div className="max-w-4xl mx-auto">
              {activeTab !== "public" && (
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-widest bg-accent/5 py-1 px-2 rounded-md border border-accent/20 animate-pulse">
                  <span>🔒 正在与 {dmConversations.find(c => c.userId === activeTab)?.nickname} 私聊中...</span>
                  <button onClick={() => setActiveTab("public")} className="ml-auto text-text-muted hover:text-accent">退出私聊 ×</button>
                </div>
              )}
              <ChatInput onSendMessage={handleSendMessage} isHost={isHost} mentions={mentionTargets} />
            </div>
          </div>
        </div>
      </div>

      {showCharacter && (
        <CharacterPanel roomId={room.id} userId={userId} currentNickname={nickname} characterData={characterData} onClose={() => setShowCharacter(false)} onNicknameChange={(newNick) => setNickname(newNick)} />
      )}
      {showBotManager && (
        <BotManager roomId={room.id} isHost={isHost} onClose={() => setShowBotManager(false)} />
      )}
      {showCheckDialog && (
        <HostCheckDialog roomId={room.id} players={mentionTargets} onClose={() => setShowCheckDialog(false)} />
      )}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMembers(false)}>
          <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg text-text">👥 在线成员 <span className="text-sm text-text-muted font-normal ml-2">{playerCount + botCount} 人</span></h3>
              <button onClick={() => setShowMembers(false)} className="text-text-muted hover:text-text text-xl">×</button>
            </div>
            <div className="flex gap-3 mb-4 text-xs">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded font-medium">👤 玩家 {playerCount}</span>
              {botCount > 0 && <span className="bg-accent/10 text-accent px-2 py-1 rounded font-medium">🤖 Bot {botCount}</span>}
            </div>
            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
              {(players || []).map((p: any, i: number) => {
                const u = p.users || p.user || { id: p.user_id, displayName: p.nickname || "Player", isBot: false };
                const nick = p.room_members?.nickname || u.displayName || u.username || "#" + u.id;
                const isBot = !!u.isBot;
                const isMe = u.id === userId;
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-alt transition">
                    <span>{isBot ? "🤖" : "👤"}</span>
                    <span className={`text-sm flex-1 ${isMe ? "font-bold text-primary" : "text-text"}`}>{nick}{isMe ? "（我）" : ""}</span>
                    <div className="flex gap-2">
                       {!isMe && (
                         <button 
                            onClick={() => { setActiveTab(u.id); setShowMembers(false); if (!isHost) markDMReadAction(room.id, u.id); }}
                            className="bg-accent/10 hover:bg-accent/20 text-accent text-[10px] px-2 py-0.5 rounded transition"
                         >
                           🔒 私聊
                         </button>
                       )}
                       <span className="text-[10px] text-text-dim font-mono self-center">@{nick}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {showInventory && (
        <InventoryPanel roomId={room.id} userId={userId} isHost={isHost} players={players.map((m: any) => ({ id: m.users?.id || m.user_id, username: m.users?.username || "", nickname: m.room_members?.nickname || m.nickname || "" }))} onClose={() => setShowInventory(false)} />
      )}
      {showSettings && (
        <RoomSettings roomId={room.id} roomName={room.name} currentTheme={roomTheme || "default"} currentDiceRules={roomDiceRules || "basic"} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
