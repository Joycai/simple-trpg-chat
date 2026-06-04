"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { NicknameEditor } from "./NicknameEditor";
import { SkillPanel } from "./SkillPanel";
import { RoomSettings } from "./RoomSettings";
import { InventoryPanel } from "./InventoryPanel";
import { BotManager } from "./BotManager";
import { sendMessageAction, updateNicknameAction, rollDiceAction, executeCommandAction } from "@/app/actions/room";
import { getUnreadInventoryCountAction, markInventoryViewedAction } from "@/app/actions/inventory";
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
  nickname: string;
  content: string;
  type: "text" | "dice" | "system";
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
}: RoomClientProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showBotManager, setShowBotManager] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [unreadItems, setUnreadItems] = useState(0);

  // Build mention targets (players + bots, excluding self)
  const mentionTargets = useMemo(() => {
    return (players || [])
      .filter((p: any) => {
        const uid = p.user?.id || p.users?.id;
        return uid !== userId;
      })
      .map((p: any, i: number) => {
        const user = p.user || p.users || {};
        const uid = user.id || i;
        const nick = p.nickname || p.room_members?.nickname || user.displayName || user.username || `player${uid}`;
        return {
          id: uid,
          nickname: nick,
          isBot: !!user.isBot,
        };
      });
  }, [players, userId]);

  // Count stats
  const botCount = (players || []).filter((p: any) => (p.user || p.users)?.isBot).length;
  const playerCount = (players || []).filter((p: any) => !(p.user || p.users)?.isBot).length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const statusRef = useRef(status);
  const isAtBottomRef = useRef(true);

  // Keep ref in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  // Fetch unread inventory count on mount and when messages update
  useEffect(() => {
    getUnreadInventoryCountAction(room.id).then(setUnreadItems).catch(() => {});
  }, [room.id]);

  // Refresh badge when new item notification arrives
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
      // Force update bottom state
      isAtBottomRef.current = true;
      setShowScrollButton(false);
    }
  };

  // Track if user is at the bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    
    // Threshold: if within 150px of bottom, consider "at bottom"
    const threshold = 150; 
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  };

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [messages]);

  // SSE Subscription with enhanced reliability and filtering
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const setupSSE = () => {
      if (sseRef.current) sseRef.current.close();

      setStatus("connecting");
      const es = new EventSource(`/api/rooms/${room.id}/events`);
      sseRef.current = es;

      es.onopen = () => {
        setStatus("connected");
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id) {
            // --- Privacy Filter V3.15 ---
            if (data.isPrivate) {
              const isSender = data.userId === userId;
              const isTarget = data.targetUserId === userId;
              if (data.targetUserId) {
                // Targeted notification: only sender + target
                if (!isSender && !isTarget) return;
              } else {
                // Generic private: sender + host
                if (!isSender && !isHost) return;
              }
            }

            setMessages((prev) => {
              if (prev.some(m => m.id === data.id)) return prev;
              return [...prev, data];
            });
          }
        } catch {
          // heartbeat
        }
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
    isPrivate?: boolean
  ) => {
    // Command detection: route .st, .rc, .rd<N>, .help to command engine
    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(room.id, userId, content);
        if (!result.success && result.error) {
          // Show error locally immediately
          const errorMsg = {
            id: Date.now(),
            roomId: room.id,
            userId,
            nickname: "SYSTEM",
            content: `❌ 指令错误: ${result.error}`,
            type: "system" as const,
            isPrivate: true, diceDetail: null,
            createdAt: new Date().toISOString()
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      } catch (e) {
        console.error("Command failed:", e);
      }
      return;
    }

    try {
      if (type === "dice" && diceDetail) {
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        await rollDiceAction(room.id, faces, detail.count, isPrivate);
      } else {
        await sendMessageAction(room.id, content, type, diceDetail, isPrivate);
      }
    } catch (e) {
      console.error("Action failed:", e);
    }
  };

  const handleNicknameSave = async (newNickname: string) => {
    await updateNicknameAction(room.id, newNickname);
    setNickname(newNickname);
  };

  return (
    <div className="flex flex-col h-screen bg-bg overflow-hidden">
      <header className="bg-header-bg border-b border-header-border shadow-sm px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-text-muted hover:text-text transition text-sm">{tn("lobby")}</Link>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-text leading-none">{room.name}</h2>
                <div 
                  className={`w-2 h-2 rounded-full ${
                    status === 'connected' ? 'bg-success' : 
                    status === 'connecting' ? 'bg-accent animate-pulse' : 
                    'bg-danger'
                  }`} 
                  title={status}
                />
              </div>
              <div className="text-[10px] text-text-dim mt-1 uppercase tracking-wider font-mono">{tn("roomId", { id: room.id })}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Bot Manager button (host only) */}
            {isHost && (
              <button
                onClick={() => setShowBotManager(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm"
              >
                <span className="text-base">🤖</span>
                <span className="text-xs font-bold hidden sm:inline">Bot</span>
              </button>
            )}

            {/* Member list button */}
            <button
              onClick={() => setShowMembers(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm"
              title="在线成员"
            >
              <span className="text-base">👥</span>
              <span className="text-xs font-bold hidden sm:inline">{playerCount + botCount}</span>
            </button>

            {/* Inventory button */}
            <button
              onClick={() => {
                setShowInventory(true);
                markInventoryViewedAction(room.id);
                setUnreadItems(0);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm relative"
            >
              <span className="text-base">📦</span>
              <span className="text-xs font-bold hidden sm:inline">道具</span>
              {unreadItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                  {unreadItems > 9 ? "9+" : unreadItems}
                </span>
              )}
            </button>

            {/* Skill panel button */}
            <button
              onClick={() => setShowSkills(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm"
            >
              <span className="text-base">📋</span>
              <span className="text-xs font-bold hidden sm:inline">技能</span>
            </button>
            
            <NicknameEditor currentNickname={nickname} onSave={handleNicknameSave} />
            
            {isHost && (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 rounded-lg bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-all duration-200 border border-transparent hover:border-border shadow-sm"
                  title="房间设置"
                >
                  <span className="text-lg leading-none">⚙️</span>
                </button>
                <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold">{t("gm")}</span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto px-4 py-4 scroll-smooth"
        >
          <div className="max-w-4xl mx-auto flex flex-col gap-1">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                nickname={msg.nickname}
                content={msg.content}
                type={msg.type}
                diceDetail={msg.diceDetail}
                isPrivate={msg.isPrivate}
                createdAt={msg.createdAt}
                isOwn={msg.userId === userId}
              />
            ))}
          </div>
        </div>

        {/* Floating "scroll to bottom" button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-6 right-8 z-20 bg-scroll-btn hover:opacity-90 text-white w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 group"
            title={t("scrollToBottom")}
          >
            <span className="text-xl group-hover:animate-bounce">↓</span>
          </button>
        )}
      </div>

      <div className="bg-white border-t border-border px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSendMessage={handleSendMessage} isHost={isHost} mentions={mentionTargets} />
        </div>
      </div>

      {/* Skills panel */}
      {showSkills && (
        <SkillPanel
          roomId={room.id}
          userId={userId}
          onClose={() => setShowSkills(false)}
        />
      )}

      {/* Bot Manager modal */}
      {showBotManager && (
        <BotManager
          roomId={room.id}
          isHost={isHost}
          onClose={() => setShowBotManager(false)}
        />
      )}

      {/* Member list panel */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMembers(false)}>
          <div className="bg-surface border border-border rounded-theme shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-lg text-text">
                👥 在线成员
                <span className="text-sm text-text-muted font-normal ml-2">{playerCount + botCount} 人</span>
              </h3>
              <button onClick={() => setShowMembers(false)} className="text-text-muted hover:text-text text-xl">×</button>
            </div>

            <div className="flex gap-3 mb-4 text-xs">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded font-medium">👤 玩家 {playerCount}</span>
              {botCount > 0 && (
                <span className="bg-accent/10 text-accent px-2 py-1 rounded font-medium">🤖 Bot {botCount}</span>
              )}
            </div>

            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
              {(players || []).map((p: any, i: number) => {
                const user = p.users || p.user || {};
                const nick = p.room_members?.nickname || p.nickname || user.displayName || user.username || `Player`;
                const isBot = !!user.isBot;
                const isMe = (p.user?.id || user.id) === userId;
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-alt transition">
                    <span>{isBot ? "🤖" : "👤"}</span>
                    <span className={`text-sm flex-1 ${isMe ? "font-bold text-primary" : "text-text"}`}>
                      {nick}{isMe ? "（我）" : ""}
                    </span>
                    <span className="text-[10px] text-text-dim font-mono">@{nick}</span>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-text-dim mt-4 pt-3 border-t border-border">
              输入 @昵称 即可提及对应成员（不能提及自己）
            </p>
          </div>
        </div>
      )}

      {/* Inventory panel */}
      {showInventory && (
        <InventoryPanel
          roomId={room.id}
          userId={userId}
          isHost={isHost}
          players={players.map((m: any) => ({ id: m.users?.id || m.user_id, username: m.users?.username || "", nickname: m.room_members?.nickname || m.nickname || "" }))}
          onClose={() => setShowInventory(false)}
        />
      )}

      {/* Room settings modal (host only) */}
      {showSettings && (
        <RoomSettings
          roomId={room.id}
          roomName={room.name}
          currentTheme={roomTheme || "default"}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
