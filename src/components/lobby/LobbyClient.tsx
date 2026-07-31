"use client";

import { useState, useRef } from "react";
import { createRoomAction, joinRoomAction } from "@/app/actions/room";
import { useLocale, useTranslations } from "next-intl";
import { THEME_LIST, getThemeName } from "@/themes/types";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import { ThemedSelect } from "@/components/shared/ThemedSelect";
import { RuleTemplateSelect } from "@/components/shared/RuleTemplateSelect";
import Link from "next/link";
import { DEFAULT_RULE_ID } from "@/lib/rules";
import { useHostLabelResolver, usePlayerLabelResolver, useRuleLabelResolver } from "@/components/shared/host-label";
import { PaneTransition } from "@/components/shared/PaneTransition";

/** Shared input/select styling for the create-room modal (rainglass spec). */
const FIELD_CLS =
  "w-full px-3 py-2.5 bg-input-bg border border-input-border rounded-theme outline-none text-sm text-text placeholder:text-text-dim focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary transition";

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
  memberCounts: Record<number, number>;
  isHost: boolean;
  userId: number;
}

export function LobbyClient({ rooms, joinedRoomIds, memberCounts, isHost, userId }: LobbyClientProps) {
  const t = useTranslations("lobby");
  // Room cards label the owner and the member count with whatever that room's
  // rule template calls the host (KP / DM / 经理 / 主持人) and the players
  // (调查员 / 冒险者 / 特工 / …), so the lobby matches the room itself.
  const hostLabelOf = useHostLabelResolver();
  const playerLabelOf = usePlayerLabelResolver();
  // Room card system badge — resolves any room's rule to its own label instead
  // of hardcoding a single rule id.
  const ruleLabelOf = useRuleLabelResolver();
  const tc = useTranslations("createRoom");
  const locale = useLocale();
  const [showCreate, setShowCreate] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState<number | null>(null);
  const [joinKey, setJoinKey] = useState("");
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [createRuleTemplate, setCreateRuleTemplate] = useState<string>(DEFAULT_RULE_ID);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopyMsg(tc("copiedToClipboard"));
    window.setTimeout(() => setCopyMsg(""), 2000);
  };

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
        <h2 className="text-3xl sm:text-4xl font-bold text-text font-theme-display">{t("title")}</h2>
        {isHost && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground px-4 py-2.5 rounded-theme font-bold transition shadow-[var(--theme-glow)]"
          >
            <Icons.Plus className="w-4 h-4" />
            {t("createRoom")}
          </button>
        )}
      </div>

      {/* Create room dialog (modal — matches the room's overlay animations) */}
      {showCreate && (
        <OverlayShell
          onClose={() => { setShowCreate(false); setCreatedKey(null); setCreateError(""); }}
          panelClassName="bg-surface rounded-theme theme-border shadow-2xl border border-border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 sm:p-8"
        >
          {(close) => (createdKey ? (
            /* Show key confirmation after creation */
            <div>
              <h3 className="font-bold text-xl mb-3 text-accent">{tc("created")}</h3>
              <div className="bg-surface-alt rounded-theme p-4 border border-border space-y-3">
                <div>
                  <span className="text-sm text-text-muted">{tc("keyCopied")}</span>
                  <div className="mt-1 flex gap-2">
                    <code className="flex-1 block bg-bg border border-border rounded-theme p-2 font-mono font-bold text-lg text-center tracking-widest text-accent select-all">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => copyKey(createdKey)}
                      className="inline-flex items-center gap-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/40 text-accent px-4 py-2 rounded-theme font-bold text-sm transition"
                      title={tc("copyKey")}
                    >
                      <Icons.Copy className="w-4 h-4" />
                      {tc("copyKey")}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-accent">{tc("tip")}</p>
              </div>
              <button
                onClick={close}
                className="mt-4 w-full bg-success hover:brightness-110 text-white py-2.5 rounded-theme font-bold transition shadow-[0_0_14px_rgb(var(--theme-success)/0.35)]"
              >
                {tc("done")}
              </button>
            </div>
          ) : (
            <div>
              <h3 className="font-bold text-2xl mb-5 bg-gradient-to-r from-success to-primary bg-clip-text text-transparent w-fit">{tc("title")}</h3>
              <form
                action={async (formData) => {
                  setCreateError("");
                  const result = await createRoomAction(formData);
                  if (result.success && result.secretKey) {
                    setCreatedKey(result.secretKey);
                  } else if (result.error) {
                    setCreateError(result.error);
                  }
                }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="roomName" className="text-xs text-text-muted font-medium">{tc("name")}</label>
                  <input
                    id="roomName"
                    name="name"
                    placeholder={tc("namePlaceholder")}
                    required
                    className={FIELD_CLS}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
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
                      className={`${FIELD_CLS} flex-1 font-mono text-accent`}
                    />
                    <button
                      type="button"
                      onClick={generateRandomKey}
                      className="flex items-center justify-center w-11 shrink-0 bg-accent/10 hover:bg-accent/20 border border-accent/40 rounded-theme text-accent transition"
                      title={tc("randomKey")}
                    >
                      <Icons.Dices className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="roomTheme" className="text-xs text-text-muted font-medium">{tc("theme")}</label>
                    <ThemedSelect id="roomTheme" name="theme" defaultValue="default">
                      {THEME_LIST.map((tm) => (
                        <option key={tm.id} value={tm.id}>
                          {tm.icon ? `${tm.icon} ` : ""}{getThemeName(tm.id, locale)}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="ruleTemplate" className="text-xs text-text-muted font-medium">{tc("ruleTemplate")}</label>
                    {/* Options enumerate registered rule modules so new rules show up automatically. */}
                    <RuleTemplateSelect
                      id="ruleTemplate"
                      name="ruleTemplate"
                      value={createRuleTemplate}
                      onChange={setCreateRuleTemplate}
                      t={tc}
                    />
                  </div>
                </div>
                {createError && <Notice variant="error">{createError}</Notice>}
                <div className="flex gap-2 justify-end items-center pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="px-4 py-2.5 text-text-muted hover:text-text transition"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    className="bg-success hover:brightness-110 text-white px-6 py-2.5 rounded-theme font-bold transition shadow-[0_0_14px_rgb(var(--theme-success)/0.35)]"
                  >
                    {tc("submit")}
                  </button>
                </div>
              </form>
            </div>
          ))}
        </OverlayShell>
      )}

      {/* Copy success toast */}
      {copyMsg && <Notice variant="success">{copyMsg}</Notice>}

      {/* Error */}
      {error && (
        <Notice variant="error">
          <span className="flex items-center justify-between gap-2">
            {error}
            <button onClick={() => setError("")} className="font-bold text-text-muted hover:text-text">
              ×
            </button>
          </span>
        </Notice>
      )}

      {/* Filter tabs — base styling lives in globals.css (.filter-*),
          per-theme overrides live in each theme's theme.css. */}
      {rooms.length > 0 && (
        <>
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
                className={`filter-tab flex-1 text-center px-3 py-3 text-sm font-medium transition-colors duration-200 ${
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

      {/* Room list — re-animates on each filter-tab switch */}
      <PaneTransition paneKey={filter}>
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
                className={`bg-surface rounded-theme theme-border shadow-sm border p-6 transition hover:shadow-md ${
                  isJoined ? "border-primary/30 bg-surface-alt" : ""
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-text truncate">{room.name}</h3>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {(() => {
                      const rt = (room as { ruleTemplate?: string | null }).ruleTemplate;
                      if (!rt || rt === DEFAULT_RULE_ID) return null;
                      return (
                        <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 inline-flex items-center gap-0.5"><Icons.Dices className="w-3 h-3" /> {ruleLabelOf(rt)}</span>
                      );
                    })()}
                    <span className="text-[10px] text-text-muted bg-surface-alt px-2 py-0.5 rounded">
                      #{room.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
                  {isOwner && (
                    <span className="bg-success/10 text-success border border-success/30 px-2 py-0.5 rounded font-medium">
                      {hostLabelOf((room as { ruleTemplate?: string | null }).ruleTemplate)}
                    </span>
                  )}
                  {isJoined && !isOwner && (
                    <span className="bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 rounded font-medium">
                      {t("joined")}
                    </span>
                  )}
                </div>

                {isJoined && !isOwner && (
                  <p className="text-xs text-text-muted mb-3">
                    {t("playerCount", {
                      player: playerLabelOf((room as { ruleTemplate?: string | null }).ruleTemplate),
                      count: memberCounts[room.id] ?? 0,
                    })}
                  </p>
                )}

                {/* Show key to room owner */}
                {isOwner && (
                  <div className="mb-3 p-2 bg-surface-alt border border-border rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <Icons.Key className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-accent font-mono font-bold truncate select-all">{room.secretKey}</span>
                    </div>
                    <button
                      onClick={() => copyKey(room.secretKey)}
                      className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent underline shrink-0 ml-2"
                      title={tc("copyKey")}
                    >
                      <Icons.Copy className="w-3 h-3" />
                      {tc("copyKey")}
                    </button>
                  </div>
                )}

                {(isJoined || isOwner) ? (
                  <Link
                    href={`/rooms/${room.id}`}
                    className="block w-full text-center bg-primary hover:bg-primary-hover text-primary-foreground py-2.5 rounded-theme font-bold text-sm transition shadow-[var(--theme-glow)]"
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
                          className="p-2 border rounded text-sm outline-none focus:ring-[3px] focus:ring-primary/[0.18]"
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
                      <>
                        <p className="text-xs text-text-muted mb-3">{t("needKey")}</p>
                        <button
                          onClick={() => setJoinRoomId(room.id)}
                          className="w-full inline-flex items-center justify-center gap-1.5 border border-border bg-transparent hover:bg-surface-alt text-text py-2.5 rounded-theme font-medium text-sm transition"
                        >
                          <Icons.Lock className="w-4 h-4" />
                          {t("joinWithKey")}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      </PaneTransition>
    </div>
  );
}
