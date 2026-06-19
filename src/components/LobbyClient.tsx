"use client";

import { useState, useRef } from "react";
import { createRoomAction, joinRoomAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/icons";
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
  const keyInputRef = useRef<HTMLInputElement>(null);

  const generateRandomKey = () => {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const key = Array.from(arr, b => chars[b % chars.length]).join("");
    if (keyInputRef.current) {
      keyInputRef.current.value = key;
      keyInputRef.current.focus();
    }
  };
  const [filter, setFilter] = useState<"all" | "mine" | "joined">("all");

  const filteredRooms = rooms.filter((room) => {
    if (filter === "mine") return room.hostId === userId;
    if (filter === "joined") return joinedRoomIds.has(room.id) && room.hostId !== userId;
    return true; // all
  });

  const tabIndex = filter === "all" ? 0 : filter === "mine" ? 1 : 2;

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
        <div className="bg-surface p-6 rounded-theme theme-border shadow-lg border border-border">
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
              <div className="flex gap-2">
                <input
                  id="roomKey"
                  name="key"
                  type="text"
                  ref={keyInputRef}
                  placeholder={tc("keyPlaceholder")}
                  required
                  minLength={1}
                  className="flex-1 p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                />
                <button
                  type="button"
                  onClick={generateRandomKey}
                  className="px-3 py-2 bg-surface-alt hover:bg-surface border border-border rounded text-sm font-mono text-accent transition"
                  title={tc("randomKey")}
                >
                  <Icons.Dices className="w-4 h-4" />
                </button>
              </div>
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
              <label htmlFor="ruleTemplate" className="text-xs text-text-muted font-medium">{tc("ruleTemplate")}</label>
              <select
                id="ruleTemplate"
                name="ruleTemplate"
                defaultValue="basic"
                className="p-2 border rounded outline-none focus:ring-2 focus:ring-primary/50 bg-surface"
              >
                <option value="basic">{tc("ruleTemplateBasic")}</option>
                <option value="coc7th">{tc("ruleTemplateCoc7th")}</option>
              </select>
              <p className="text-xs text-text-muted">{tc("ruleTemplateHint")}</p>
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
                  className="bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 rounded font-bold text-sm"
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

      {/* Filter tabs */}
      {rooms.length > 0 && (
        <>
          <style>{`
            /* === Base indicator: neon cyan (default/tech) === */
            .filter-indicator {
              background: var(--theme-primary, #22d3ee);
              box-shadow: 0 0 8px var(--theme-primary, #22d3ee), 0 0 16px rgba(34, 211, 238, 0.3);
            }
            .filter-tab-active {
              color: var(--theme-primary, #22d3ee);
            }

            /* === Shrine: vermillion + gold omamori (light washi) === */
            [data-theme="shrine"] .filter-indicator {
              background: linear-gradient(180deg, #c63026 0%, #a5241c 100%);
              box-shadow: 0 0 6px rgba(198, 48, 38, 0.4), inset 0 1px 0 rgba(184, 142, 56, 0.4);
              border: 1px solid rgba(165, 36, 28, 0.6);
              border-radius: 3px;
            }
            [data-theme="shrine"] .filter-tab-active {
              color: #c63026;
              text-shadow: none;
            }

            /* === Cthulhu: eldritch violet glow + fade === */
            [data-theme="cthulhu"] .filter-indicator {
              background: #a87af6;
              box-shadow: 0 0 12px rgba(168, 122, 246, 0.55), 0 0 24px rgba(120, 90, 235, 0.25);
            }
            [data-theme="cthulhu"] .filter-tab-active {
              color: #c4aef9;
              text-shadow: 0 0 10px rgba(168, 122, 246, 0.45);
            }

            /* === Parchment: inscriptional serif text + static border === */
            [data-theme="parchment"] .filter-indicator {
              display: none;
            }
            [data-theme="parchment"] .filter-tab {
              font-family: var(--theme-font-display);
              border-bottom: 2px solid transparent;
              border-radius: 4px 4px 0 0;
              transition: color 0.2s, border-color 0.2s, background 0.2s;
            }
            [data-theme="parchment"] .filter-tab-active {
              color: #82401e;
              border-bottom-color: #82401e;
              background: rgba(130, 64, 30, 0.1);
              text-shadow: none;
            }
          `}</style>

          <div className="filter-tabs-container relative flex border-b border-border">
            {/* Sliding indicator */}
            <div
              className="filter-indicator absolute bottom-0 h-[2px] rounded-full transition-all duration-300 ease-out"
              style={{
                left: `${tabIndex * 33.33}%`,
                width: '33.33%',
              }}
            />

            {([
              ["all", t("filterAll")],
              ["mine", t("filterMine")],
              ["joined", t("filterJoined")],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`filter-tab flex-1 text-center px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  filter === key
                    ? "filter-tab-active"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Room list */}
      {filteredRooms.length === 0 ? (
        <div className="text-center text-text-muted py-16">
          <div className="mb-4 flex justify-center">
            {filter === "mine" ? <Icons.Home className="w-10 h-10 text-text-muted" /> : filter === "joined" ? <Icons.Key className="w-10 h-10 text-text-muted" /> : <Icons.Dices className="w-10 h-10 text-text-muted" />}
          </div>
          <p>{filter === "mine" ? t("noOwnRooms") : filter === "joined" ? t("noJoinedRooms") : t("noRooms")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRooms.map((room) => {
            const isJoined = joinedRoomIds.has(room.id);
            const isOwner = room.hostId === userId;

            return (
              <div
                key={room.id}
                className={`bg-surface rounded-theme theme-border shadow-sm border p-5 transition hover:shadow-md ${
                  isJoined ? "border-primary/30 bg-surface-alt" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-text truncate">{room.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(room as { ruleTemplate?: string }).ruleTemplate === "coc7th" && (
                      <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 inline-flex items-center gap-0.5"><Icons.Skull className="w-3 h-3" /> COC 7th</span>
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
                      <Icons.Key className="w-4 h-4 text-accent shrink-0" />
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
