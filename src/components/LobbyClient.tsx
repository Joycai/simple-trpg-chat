"use client";

import { useState } from "react";
import { createRoomAction, joinRoomAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("lobby");
  const tc = useTranslations("createRoom");
  const [showCreate, setShowCreate] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState<number | null>(null);
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleJoin = async (formData: FormData) => {
    setError("");
    const result = await joinRoomAction(formData);
    if (result.success) {
      setJoinRoomId(null);
      setJoinKey("");
    } else {
      setError(result.error || t("joinFailed"));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Title row */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text">{t("title")}</h2>
        {isHost && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-success hover:bg-primary-hover text-white px-4 py-2 rounded-theme font-bold transition"
          >
            {t("createRoom")}
          </button>
        )}
      </div>

      {/* Create room dialog */}
      {showCreate && !createdKey && (
        <div className="bg-surface p-6 rounded-theme shadow-lg border border-border">
          <h3 className="font-bold text-lg mb-4 text-success">{tc("title")}</h3>
          <form
            action={async (formData) => {
              setError("");
              const result = await createRoomAction(formData);
              if (result.success && result.secretKey) {
                setCreatedKey(result.secretKey);
              } else if (result.error) {
                setError(result.error);
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="roomName" className="text-xs text-text-muted font-medium">{tc("name")}</label>
              <input
                id="roomName"
                name="name"
                placeholder={tc("namePlaceholder")}
                required
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="roomKey" className="text-xs text-text-muted font-medium">{tc("key")}</label>
              <input
                id="roomKey"
                name="key"
                type="text"
                placeholder={tc("keyPlaceholder")}
                required
                minLength={1}
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50 font-mono"
              />
              <p className="text-xs text-text-muted">{tc("keyHint")}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="roomTheme" className="text-xs text-text-muted font-medium">{tc("theme")}</label>
              <select
                id="roomTheme"
                name="theme"
                defaultValue="default"
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50 bg-surface"
              >
                <option value="default">{tc("themeDefault")}</option>
                <option value="parchment">{tc("themeParchment")}</option>
                <option value="cthulhu">{tc("themeCthulhu")}</option>
                <option value="shrine">{tc("themeShrine")}</option>
              </select>
              <p className="text-xs text-text-muted">{tc("themeHint")}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ruleTemplate" className="text-xs text-text-muted font-medium">规则模版</label>
              <select
                id="ruleTemplate"
                name="ruleTemplate"
                defaultValue="basic"
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50 bg-surface"
              >
                <option value="basic">🎲 通用 d100</option>
                <option value="coc7th">🐙 COC 7th</option>
              </select>
              <p className="text-xs text-text-muted">COC 7th 将自动初始化 8 属性 + 衍生值</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-text-muted hover:text-text"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="bg-success hover:bg-primary-hover text-white px-6 py-2 rounded-theme font-bold"
              >
                {tc("submit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Show key confirmation after creation */}
      {createdKey && (
        <div className="bg-surface-alt border-2 border-border rounded-theme p-6 shadow-lg">
          <h3 className="font-bold text-lg mb-3 text-accent">{tc("created")}</h3>
          <div className="bg-surface rounded p-4 border border-border space-y-3">
            <div>
              <span className="text-sm text-text-muted">{tc("keyCopied")}</span>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 block bg-bg border rounded p-2 font-mono font-bold text-lg text-center tracking-widest select-all">
                  {createdKey}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(createdKey)}
                  className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded font-bold text-sm"
                  title={tc("copyKey")}
                >
                  {tc("copyKey")}
                </button>
              </div>
            </div>
            <p className="text-sm text-accent">{tc("tip")}</p>
          </div>
          <button
            onClick={() => { setShowCreate(false); setCreatedKey(null); }}
            className="mt-3 w-full bg-success hover:bg-primary-hover text-white py-2 rounded-theme font-bold"
          >
            {tc("done")}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-2 rounded text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">
            ×
          </button>
        </div>
      )}

      {/* Room list */}
      {rooms.length === 0 ? (
        <div className="text-center text-text-muted py-16">
          <div className="text-4xl mb-4">🎲</div>
          <p>{t("noRooms")}</p>
          {isHost && <p className="text-sm mt-2">{t("noRoomsHint")}</p>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const isJoined = joinedRoomIds.has(room.id);
            const isOwner = room.hostId === userId;

            return (
              <div
                key={room.id}
                className={`bg-surface rounded-theme shadow-sm border p-5 transition hover:shadow-md ${
                  isJoined ? "border-primary/30 bg-surface-alt" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-text truncate">{room.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(room as any).ruleTemplate === "coc7th" && (
                      <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">🐙 COC 7th</span>
                    )}
                    <span className="text-[10px] text-text-muted bg-surface-alt px-2 py-0.5 rounded">
                      #{room.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
                  {isJoined && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                      {t("joined")}
                    </span>
                  )}
                  {isOwner && (
                    <span className="bg-success/10 text-success px-2 py-0.5 rounded font-medium">
                      {t("host")}
                    </span>
                  )}
                </div>

                {/* Show key to room owner */}
                {isOwner && (
                  <div className="mb-3 p-2 bg-surface-alt border border-border rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <span className="text-accent shrink-0">🔑</span>
                      <span className="text-accent font-mono font-bold truncate select-all">{room.secretKey}</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(room.secretKey);
                      }}
                      className="text-[10px] text-accent hover:text-accent underline shrink-0 ml-2"
                      title={tc("copyKey")}
                    >
                      {tc("copyKey")}
                    </button>
                  </div>
                )}

                {(isJoined || isOwner) ? (
                  <Link
                    href={`/rooms/${room.id}`}
                    className="block w-full text-center bg-primary hover:bg-primary-hover text-white py-2 rounded-theme font-bold text-sm transition"
                  >
                    {t("enterRoom")}
                  </Link>
                ) : (
                  <>
                    {joinRoomId === room.id ? (
                      <form action={handleJoin} className="flex flex-col gap-2">
                        <input type="hidden" name="roomId" value={room.id} />
                        <input
                          name="key"
                          type="text"
                          placeholder={t("keyPlaceholder")}
                          value={joinKey}
                          onChange={(e) => setJoinKey(e.target.value)}
                          className="p-2 border rounded text-sm outline-none focus:ring-2 focus:ring-primary/50"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setJoinRoomId(null);
                              setJoinKey("");
                            }}
                            className="flex-1 text-xs text-text-muted hover:text-text py-1"
                          >
                            {t("cancel")}
                          </button>
                          <button
                            type="submit"
                            className="flex-1 bg-primary hover:bg-primary-hover text-white py-2 rounded text-sm font-bold"
                          >
                            {t("join")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setJoinRoomId(room.id)}
                        className="w-full bg-surface-alt hover:bg-surface text-text py-2 rounded-theme font-medium text-sm transition"
                      >
                        {t("joinWithKey")}
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
