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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(scrollToBottom, [messages]);

  // SSE Subscription
  useEffect(() => {
    const eventSource = new EventSource(`/api/rooms/${room.id}/events`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => {
        // Avoid duplicates if SSE and Server Action both update
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [room.id]);

  const handleSendMessage = async (
    content: string,
    type: "text" | "dice",
    diceDetail?: string,
    isPrivate?: boolean
  ) => {
    // If it's a dice roll, we use the server-side action instead
    if (type === "dice" && diceDetail) {
      try {
        const detail = JSON.parse(diceDetail);
        const faces = parseInt(detail.dice.replace("d", ""));
        await rollDiceAction(room.id, faces, detail.count, isPrivate);
      } catch (e) {
        console.error("Dice roll failed:", e);
      }
      return;
    }

    try {
      await sendMessageAction(room.id, content, type, diceDetail, isPrivate);
    } catch (e) {
      console.error("Send message failed:", e);
    }
  };

  const handleNicknameSave = async (newNickname: string) => {
    await updateNicknameAction(room.id, newNickname);
    setNickname(newNickname);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition">← 大厅</Link>
            <div>
              <h2 className="font-bold text-gray-800">{room.name}</h2>
              <div className="text-xs text-gray-400">房间 #{room.id}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NicknameEditor currentNickname={nickname} onSave={handleNicknameSave} />
            {isHost && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">主持人</span>}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-4xl mx-auto flex flex-col">
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

      <div className="bg-white border-t px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSendMessage={handleSendMessage} isHost={isHost} />
        </div>
      </div>
    </div>
  );
}
