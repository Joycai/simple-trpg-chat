"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { NicknameEditor } from "./NicknameEditor";
import { SkillPanel } from "./SkillPanel";
import { RoomSettings } from "./RoomSettings";
import { sendMessageAction, updateNicknameAction, rollDiceAction, executeCommandAction } from "@/app/actions/room";
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
}

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
  roomTheme,
  roomDiceRules,
}: RoomClientProps) {
  const t = useTranslations("room");
  const tn = useTranslations("nav");
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const statusRef = useRef(status);
  const isAtBottomRef = useRef(true);

  // Keep ref in sync
  useEffect(() => { statusRef.current = status; }, [status]);

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

  const forceReconnect = () => {
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
          setMessages((prev) => {
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
        }
      } catch {
        // heartbeat or malformed event
      }
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
    };
  };

  // SSE Subscription with enhanced reliability
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
  }, [room.id]);

  const ensureConnected = async () => {
    if (statusRef.current === "error") {
      forceReconnect();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  const handleSendMessage = async (
    content: string,
    type: "text" | "dice",
    diceDetail?: string,
    isPrivate?: boolean
  ) => {
    await ensureConnected();

    /// Command detection: route .st, .rc, .rd<N>, .help to command engine
    if (content.startsWith(".") && type === "text") {
      try {
        const result = await executeCommandAction(room.id, userId, content);
        if (!result.success && result.error) {
          // Show error as system message
          await sendMessageAction(room.id, `❌ ${result.error}`, "system");
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
          <div className="flex items-center gap-3">
            {/* Skill panel button */}
            <button
              onClick={() => setShowSkills(true)}
              className="p-1.5 rounded-full hover:bg-surface-alt text-text-dim hover:text-text transition-all duration-200"
              title="技能面板"
            >
              📋
            </button>
            <NicknameEditor currentNickname={nickname} onSave={handleNicknameSave} />
            {isHost && (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 rounded-full hover:bg-surface-alt text-text-dim hover:text-text transition-all duration-200"
                  title="房间设置"
                >
                  <span className="text-xl leading-none">⚙️</span>
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

      <div className="bg-surface border-t border-border px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSendMessage={handleSendMessage} isHost={isHost} />
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
