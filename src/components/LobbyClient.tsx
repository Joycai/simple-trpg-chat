"use client";

import { useState } from "react";
import { createRoomAction, joinRoomAction } from "@/app/actions/room";
import Link from "next/link";

interface Room {
  id: number;
  name: string;
  hostId: number;
  secretKey: string;
  status: string;
  createdAt: string;
}

interface LobbyClientProps {
  rooms: Room[];
  joinedRoomIds: Set<number>;
  isHost: boolean;
  userId: number;
}

export function LobbyClient({ rooms, joinedRoomIds, isHost, userId }: LobbyClientProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState<number | null>(null);
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleJoin = async (formData: FormData) => {
    setError("");
    try {
      await joinRoomAction(formData);
      setJoinRoomId(null);
      setJoinKey("");
    } catch (e: any) {
      setError(e.message || "加入失败");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Title row */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">🏠 房间大厅</h2>
        {isHost && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold transition"
          >
            ＋ 创建房间
          </button>
        )}
      </div>

      {/* Create room dialog */}
      {showCreate && !createdKey && (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-green-200">
          <h3 className="font-bold text-lg mb-4 text-green-800">创建新房间</h3>
          <form
            action={async (formData) => {
              try {
                const result = await createRoomAction(formData);
                setCreatedKey(result.secretKey);
              } catch (e: any) {
                setError(e.message);
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="roomName" className="text-xs text-gray-500 font-medium">房间名称</label>
              <input
                id="roomName"
                name="name"
                placeholder="例如：轰鸣的下行电梯"
                required
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-green-300"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="roomKey" className="text-xs text-gray-500 font-medium">房间密钥</label>
              <input
                id="roomKey"
                name="key"
                type="text"
                placeholder="设置一个密钥，分享给玩家加入"
                required
                minLength={1}
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-green-300 font-mono"
              />
              <p className="text-xs text-gray-400">玩家加入房间时需要输入此密钥</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg font-bold"
              >
                创建
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Show key confirmation after creation */}
      {createdKey && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6 shadow-lg">
          <h3 className="font-bold text-lg mb-3 text-amber-800">🎉 房间已创建！</h3>
          <div className="bg-white rounded p-4 border border-amber-200 space-y-3">
            <div>
              <span className="text-sm text-gray-500">房间密钥（请分享给玩家）：</span>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 block bg-gray-50 border rounded p-2 font-mono font-bold text-lg text-center tracking-widest select-all">
                  {createdKey}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(createdKey)}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded font-bold text-sm"
                  title="复制密钥"
                >
                  📋 复制
                </button>
              </div>
            </div>
            <p className="text-sm text-amber-700">
              💡 玩家需要输入此密钥才能加入房间。点击"进入房间"开始游戏
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(false); setCreatedKey(null); }}
            className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg font-bold"
          >
            知道了，进入大厅
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <div className="text-4xl mb-4">🎲</div>
          <p>还没有房间</p>
          {isHost && <p className="text-sm mt-2">点击"创建房间"开始吧！</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const isJoined = joinedRoomIds.has(room.id);
            const isOwner = room.hostId === userId;

            return (
              <div
                key={room.id}
                className={`bg-white rounded-lg shadow-sm border p-5 transition hover:shadow-md ${
                  isJoined ? "border-blue-300 bg-blue-50/50" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-gray-800 truncate">{room.name}</h3>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                    #{room.id}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                  {isJoined && (
                    <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-medium">
                      已加入
                    </span>
                  )}
                  {isOwner && (
                    <span className="bg-green-100 text-green-600 px-2 py-0.5 rounded font-medium">
                      主持人
                    </span>
                  )}
                </div>

                {/* Show key to room owner */}
                {isOwner && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <span className="text-amber-600 shrink-0">🔑</span>
                      <span className="text-amber-800 font-mono font-bold truncate select-all">{room.secretKey}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(room.secretKey);
                      }}
                      className="text-[10px] text-amber-500 hover:text-amber-700 underline shrink-0 ml-2"
                      title="复制密钥"
                    >
                      复制
                    </button>
                  </div>
                )}

                {(isJoined || isOwner) ? (
                  <Link
                    href={`/rooms/${room.id}`}
                    className="block w-full text-center bg-blue-500 hover:bg-blue-600 text-white py-2 rounded-lg font-bold text-sm transition"
                  >
                    进入房间 →
                  </Link>
                ) : (
                  <>
                    {joinRoomId === room.id ? (
                      <form action={handleJoin} className="flex flex-col gap-2">
                        <input type="hidden" name="roomId" value={room.id} />
                        <input
                          name="key"
                          type="text"
                          placeholder="输入密钥"
                          value={joinKey}
                          onChange={(e) => setJoinKey(e.target.value)}
                          className="p-2 border rounded text-sm outline-none focus:ring-2 focus:ring-blue-300"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setJoinRoomId(null);
                              setJoinKey("");
                            }}
                            className="flex-1 text-xs text-gray-400 hover:text-gray-600 py-1"
                          >
                            取消
                          </button>
                          <button
                            type="submit"
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 rounded text-sm font-bold"
                          >
                            加入
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setJoinRoomId(room.id)}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium text-sm transition"
                      >
                        🔑 输入密钥加入
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
