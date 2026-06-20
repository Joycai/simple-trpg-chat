"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { updateRoomNameAction, regenerateRoomPasswordAction, setRoomFrozenAction } from "@/app/actions/room";
import { getThemeName, type ThemeId } from "@/themes/types";
import { useOverlayTransition } from "@/lib/useOverlayTransition";

interface RoomInfoPanelProps {
  room: {
    id: number;
    name: string;
    hostId: number;
    secretKey: string;
    theme: string;
    diceRules: string;
    ruleTemplate: string;
    status: string;
    frozen?: boolean;
    createdAt: string;
  };
  isHost: boolean;
  userId: number;
  onClose: () => void;
}

export function RoomInfoPanel({ room, isHost, userId, onClose }: RoomInfoPanelProps) {
  const t = useTranslations("roomInfo");
  const ts = useTranslations("roomSettings");
  const locale = useLocale();
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { close, backdropClass, panelClass } = useOverlayTransition(onClose, "drawer");
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(room.name);
  const [savingName, setSavingName] = useState(false);
  const [regeneratingPassword, setRegeneratingPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [togglingFreeze, setTogglingFreeze] = useState(false);
  const [error, setError] = useState("");

  const getRuleTemplateLabel = (val: string) => {
    if (val === "basic") return ts("ruleTemplateBasic");
    if (val === "coc7th") return ts("ruleTemplateCoc7th");
    return val;
  };

  const getDiceRulesLabel = (val: string) => {
    if (val === "basic") return ts("diceRulesBasic");
    if (val === "coc7th") return ts("diceRulesCoc7th");
    return val;
  };

  const handleSaveName = async () => {
    setSavingName(true);
    setError("");
    try {
      await updateRoomNameAction(room.id, newName);
      setEditingName(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleFreeze = async () => {
    setTogglingFreeze(true);
    setError("");
    try {
      await setRoomFrozenAction(room.id, !room.frozen);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setTogglingFreeze(false);
    }
  };

  const handleRegeneratePassword = async () => {
    setRegeneratingPassword(true);
    setError("");
    try {
      await regenerateRoomPasswordAction(room.id);
      setShowPasswordConfirm(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setRegeneratingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" onClick={close}>
      <div className={`absolute inset-0 bg-black/30 ${backdropClass}`} />
      <div className={`relative ml-auto w-full sm:w-80 bg-surface border-l border-border shadow-2xl h-full overflow-y-auto ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button onClick={close} className="text-text-muted hover:text-text text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Room name */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">{t("nameLabel")}</label>
            <div className="flex items-center gap-2">
              <p className="text-text font-bold text-lg flex-1">{room.name}</p>
              {isHost && !editingName && (
                <button
                  onClick={() => {
                    setEditingName(true);
                    setNewName(room.name);
                  }}
                  className="text-xs text-primary hover:text-primary-hover transition"
                >
                  {t("editButton")}
                </button>
              )}
            </div>
            <p className="text-[10px] text-text-muted font-mono">#{room.id}</p>
          </div>

          {/* Edit name modal */}
          {isHost && editingName && (
            <div className="bg-surface-alt border border-border rounded-lg p-4 flex flex-col gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("nameLabel")}
                maxLength={100}
                className="p-2 border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm"
                autoFocus
              />
              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-2 py-1 rounded">
                  {error}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-1.5 text-xs text-text-muted hover:text-text transition"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !newName.trim()}
                  className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded transition"
                >
                  {savingName ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          )}

          {/* Rules */}
          <div className="bg-surface-alt rounded-theme p-4 border border-border">
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-3 block">{t("configLabel")}</label>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("ruleTemplate")}</span>
                <span className="text-xs font-bold text-text">{getRuleTemplateLabel(room.ruleTemplate)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("diceRules")}</span>
                <span className="text-xs font-bold text-text">{getDiceRulesLabel(room.diceRules)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-muted">{t("theme")}</span>
                <span className="text-xs font-bold text-text">{getThemeName(room.theme as ThemeId, locale)}</span>
              </div>
            </div>
          </div>

          {/* Host info */}
          <div>
            <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium mb-1 block">{t("host")}</label>
            <p className="text-sm text-text">
              {isHost ? t("hostMe") : `ID: ${room.hostId}`}
            </p>
          </div>

          {/* Secret key — Host only */}
          {isHost && (
            <div className="bg-danger/5 border border-danger/20 rounded-theme p-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-danger uppercase tracking-wider font-medium block">{t("secretKey")}</label>
                {!showPasswordConfirm && (
                  <button
                    onClick={() => setShowPasswordConfirm(true)}
                    className="text-xs text-danger hover:text-danger/80 transition"
                  >
                    {t("regenerateButton")}
                  </button>
                )}
              </div>
              <code className="block bg-bg border border-danger/20 rounded p-2 font-mono font-bold text-sm text-center text-danger tracking-widest select-all">
                {room.secretKey}
              </code>
              <p className="text-[10px] text-text-dim mt-1">{t("secretKeyDesc")}</p>

              {/* Regenerate confirmation */}
              {showPasswordConfirm && (
                <div className="mt-3 pt-3 border-t border-danger/20 flex flex-col gap-2">
                  <p className="text-xs text-danger">{t("regenerateWarning")}</p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowPasswordConfirm(false)}
                      className="px-3 py-1.5 text-xs text-text-muted hover:text-text transition"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      onClick={handleRegeneratePassword}
                      disabled={regeneratingPassword}
                      className="px-3 py-1.5 text-xs bg-danger hover:bg-danger/80 disabled:opacity-50 text-white rounded transition"
                    >
                      {regeneratingPassword ? t("regenerating") : t("regenerateConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Freeze — Host only */}
          {isHost && (
            <div className={`rounded-theme p-4 border ${room.frozen ? "bg-accent/5 border-accent/20" : "bg-surface-alt border-border"}`}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-text-dim uppercase tracking-wider font-medium block">{t("freezeLabel")}</label>
                <button
                  onClick={handleToggleFreeze}
                  disabled={togglingFreeze}
                  className={`text-xs font-medium transition disabled:opacity-50 ${room.frozen ? "text-success hover:text-success/80" : "text-accent hover:text-accent/80"}`}
                >
                  {togglingFreeze ? t("saving") : room.frozen ? t("unfreeze") : t("freeze")}
                </button>
              </div>
              <p className="text-[10px] text-text-dim mt-1">{t("freezeDesc")}</p>
            </div>
          )}

          {/* Status & Created */}
          <div className="border-t border-border pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-text-muted">{t("status")}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                room.frozen ? "bg-accent/10 text-accent" : room.status === "active" ? "bg-success/10 text-success" : "bg-text-dim/10 text-text-dim"
              }`}>
                {room.frozen ? t("statusFrozen") : room.status === "active" ? t("statusActive") : t("statusClosed")}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-text-muted">{t("createdAt")}</span>
              <span className="text-xs text-text-dim font-mono">{room.createdAt}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
