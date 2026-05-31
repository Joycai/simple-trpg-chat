"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { NicknameEditor } from "./NicknameEditor";
import { sendMessageAction, updateNicknameAction, rollDiceAction } from "@/app/actions/room";
import Link from "next/link";

interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
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
}

export function RoomClient({
  room,
  messages: initialMessages,
  userId,
  isHost,
  currentNickname,
}: RoomClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [nickname, setNickname] = useState(currentNickname);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const statusRef = useRef(status);

  // Keep ref in sync
  useEffect(() => { statusRef.current = status; }, [status]);

  const forceReconnect = () => {
    if (sseRef.current) {
      sseRef.current.close();
    }
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
          // heartbeat or malformed event
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

  /**
   * Check SSE health before any user action.
   * If disconnected, force an immediate reconnect so messages/rolls
   * can be received without a page refresh.
   */
  const ensureConnected = async () => {
    if (statusRef.current === "error") {
      forceReconnect();
      // Brief wait for SSE to establish before sending message
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
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <header className="bg-white border-b shadow-sm px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition text-sm">← 大厅</Link>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-800 leading-none">{room.name}</h2>
                <div 
                  className={`w-2 h-2 rounded-full ${
                    status === 'connected' ? 'bg-green-500' : 
                    status === 'connecting' ? 'bg-amber-500 animate-pulse' : 
                    'bg-red-500'
                  }`} 
                  title={status}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-mono">Room ID: {room.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NicknameEditor currentNickname={nickname} onSave={handleNicknameSave} />
            {isHost && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">GM</span>}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 scroll-smooth">
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

      <div className="bg-white border-t px-4 py-3 shrink-0">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSendMessage={handleSendMessage} isHost={isHost} />
        </div>
      </div>
    </div>
  );
}
