"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { updateRoomNameAction, regenerateRoomPasswordAction, setRoomFrozenAction } from "@/app/actions/room";
import { getThemeName, type ThemeId } from "@/themes/types";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { Icons } from "@/components/shared/icons";
import { getRule, listRules } from "@/lib/rules";

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

export function RoomInfoPanel({ room, isHost, onClose }: RoomInfoPanelProps) {
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

  // Label lookup driven by the rule registry: any registered rule's
  // i18n label key is honored, unknown ids fall back to their raw value.
  const getRuleTemplateLabel = (val: string) => {
    const rule = listRules().find(r => r.id === val);
    return rule ? ts(rule.labelKey) : val;
  };

  // `diceRules` is a transitional column (Phase 4 drops it); resolve via the
  // same registry so any rule name shows correctly regardless of which column
  // carries it.
  const getDiceRulesLabel = (val: string) => {
    const rule = getRule(val);
    return rule.id === val ? ts(rule.labelKey) : val;
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
      <div className={`relative ml-auto w-full sm:w-[26rem] bg-surface border-l border-border shadow-2xl h-full overflow-y-auto ${panelClass}`}
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-5 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-xl font-theme-display">{t("title")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Room name */}
          <div>
            <label className="text-sm text-text-muted mb-1.5 block">{t("nameLabel")}</label>
            <div className="flex items-baseline gap-2">
              <p className="text-text font-bold text-2xl flex-1 font-theme-display">{room.name}</p>
              {isHost && !editingName && (
                <button
                  onClick={() => { setEditingName(true); setNewName(room.name); }}
                  className="text-sm text-primary hover:text-primary-hover transition cursor-pointer shrink-0"
                >
                  {t("editButton")}
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted font-theme-mono mt-1">#{room.id}</p>
          </div>

          {/* Edit name form */}
          {isHost && editingName && (
            <div className="bg-surface-alt/40 border border-border rounded-theme p-4 flex flex-col gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("nameLabel")}
                maxLength={100}
                className="px-3.5 py-2.5 border border-input-border bg-input-bg rounded-theme outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary text-text text-sm"
                autoFocus
              />
              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger text-xs px-2 py-1 rounded-theme">
                  {error}
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingName(false)}
                  className="px-3 py-1.5 text-xs text-text-muted hover:text-text transition cursor-pointer">
                  {tCommon("cancel")}
                </button>
                <button onClick={handleSaveName} disabled={savingName || !newName.trim()}
                  className="px-4 py-1.5 text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground rounded-theme font-bold transition cursor-pointer">
                  {savingName ? t("saving") : t("save")}
                </button>
              </div>
            </div>
          )}

          {/* Config */}
          <div className="bg-surface-alt/40 rounded-theme p-4 border border-border">
            <label className="text-sm text-text-dim mb-3 block">{t("configLabel")}</label>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">{t("ruleTemplate")}</span>
                <span className="text-sm font-bold text-text">{getRuleTemplateLabel(room.ruleTemplate)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">{t("diceRules")}</span>
                <span className="text-sm font-bold text-text">{getDiceRulesLabel(room.diceRules)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">{t("theme")}</span>
                <span className="text-sm font-bold text-text">{getThemeName(room.theme as ThemeId, locale)}</span>
              </div>
            </div>
          </div>

          {/* Secret key — Host only */}
          {isHost && (
            <div className="bg-danger/5 border border-danger/30 rounded-theme p-4">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-sm font-medium text-danger block">{t("secretKey")}</label>
                {!showPasswordConfirm && (
                  <button onClick={() => setShowPasswordConfirm(true)}
                    className="text-sm text-danger hover:text-danger/80 transition cursor-pointer">
                    {t("regenerateButton")}
                  </button>
                )}
              </div>
              <code className="block bg-bg border border-danger/20 rounded-theme py-3 font-theme-mono font-bold text-lg text-center text-danger tracking-[0.3em] select-all">
                {room.secretKey}
              </code>
              <p className="text-xs text-text-dim mt-2">{t("secretKeyDesc")}</p>

              {showPasswordConfirm && (
                <div className="mt-3 pt-3 border-t border-danger/20 flex flex-col gap-2">
                  <p className="text-xs text-danger">{t("regenerateWarning")}</p>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowPasswordConfirm(false)}
                      className="px-3 py-1.5 text-xs text-text-muted hover:text-text transition cursor-pointer">
                      {tCommon("cancel")}
                    </button>
                    <button onClick={handleRegeneratePassword} disabled={regeneratingPassword}
                      className="px-4 py-1.5 text-xs bg-danger hover:bg-danger/80 disabled:opacity-50 text-white rounded-theme font-bold transition cursor-pointer">
                      {regeneratingPassword ? t("regenerating") : t("regenerateConfirm")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Freeze — Host only */}
          {isHost && (
            <div className={`rounded-theme p-4 border ${room.frozen ? "bg-warning/5 border-warning/30" : "bg-surface-alt/40 border-border"}`}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text block">{t("freezeLabel")}</label>
                <button onClick={handleToggleFreeze} disabled={togglingFreeze}
                  className={`text-sm font-bold transition disabled:opacity-50 cursor-pointer ${room.frozen ? "text-success hover:text-success/80" : "text-warning hover:brightness-110"}`}>
                  {togglingFreeze ? t("saving") : room.frozen ? t("unfreeze") : t("freeze")}
                </button>
              </div>
              <p className="text-xs text-text-dim mt-1.5">{t("freezeDesc")}</p>
            </div>
          )}

          {/* Status & Created */}
          <div className="border-t border-border pt-4 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">{t("status")}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                room.frozen ? "bg-warning/15 text-warning" : room.status === "active" ? "bg-success/15 text-success" : "bg-text-dim/10 text-text-dim"
              }`}>
                {room.frozen ? t("statusFrozen") : room.status === "active" ? t("statusActive") : t("statusClosed")}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">{t("createdAt")}</span>
              <span className="text-sm text-text-dim font-theme-mono">{(room.createdAt || "").slice(0, 10)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
