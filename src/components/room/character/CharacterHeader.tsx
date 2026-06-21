"use client";

import { useTranslations } from "next-intl";
import { PRESET_AVATAR_COLORS, getContrastColor } from "@/lib/avatar-colors";
import { Icons } from "@/components/shared/icons";

interface CharacterHeaderProps {
  nickname: string;
  currentNickname: string;
  editingNick: boolean;
  onEditingNickChange: (v: boolean) => void;
  onNicknameChange: (v: string) => void;
  onSaveNickname: () => void;
  avatarSrc: string | null;
  selectedColor: string;
  readOnly: boolean;
  onChangeAvatar: () => void;
  ruleTemplate: string;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

export function CharacterHeader({
  nickname, currentNickname, editingNick, onEditingNickChange, onNicknameChange,
  onSaveNickname, avatarSrc, selectedColor, readOnly, onChangeAvatar,
  ruleTemplate, onColorChange, onClose,
}: CharacterHeaderProps) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");

  return (
    /* Profile header banner */
    <div className="relative shrink-0 border-b border-border bg-gradient-to-br from-primary/10 via-surface to-surface-alt px-5 pt-5 pb-4">
      <button onClick={onClose} title={tCommon("close")}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
        <Icons.X className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-4 pr-9">
        {/* Avatar (photo or colored initial) */}
        <div className="relative shrink-0">
          <div className="rounded-full p-[2px] shadow-md transition-colors" style={{ backgroundColor: selectedColor }}>
            <div
              className="w-16 h-16 rounded-full overflow-hidden border-2 border-surface flex items-center justify-center text-2xl font-bold"
              style={avatarSrc ? undefined : { backgroundColor: selectedColor, color: getContrastColor(selectedColor) }}
            >
              {avatarSrc
                ? <img src={avatarSrc} alt={nickname} className="w-full h-full object-cover" />
                : nickname.charAt(0).toUpperCase()}
            </div>
          </div>
          {!readOnly && (
            <button onClick={onChangeAvatar} title={t("changeAvatar")}
              className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-primary hover:bg-primary-hover text-white border-2 border-surface shadow-md flex items-center justify-center transition cursor-pointer">
              <Icons.ImagePlus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Name + rule badge */}
        <div className="flex-1 min-w-0">
          {editingNick ? (
            <div className="flex gap-2">
              <input value={nickname} onChange={e => onNicknameChange(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSaveNickname(); if (e.key === "Escape") { onNicknameChange(currentNickname); onEditingNickChange(false); } }}
                className="flex-1 min-w-0 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" autoFocus />
              <button onClick={onSaveNickname} className="text-xs bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded font-bold cursor-pointer shrink-0">{tCommon("confirm")}</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-bold text-text text-xl leading-tight truncate">{nickname}</h3>
              {!readOnly && (
                <button onClick={() => onEditingNickChange(true)} title={t("editName")}
                  className="shrink-0 text-text-muted hover:text-primary transition cursor-pointer p-0.5">
                  <Icons.Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="mt-1.5">
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
              {ruleTemplate === "coc7th" ? t("badgeCoc7th") : t("badgeGeneric")}
            </span>
          </div>
        </div>
      </div>

      {/* Avatar color picker */}
      {!readOnly && (
        <div className="flex items-center gap-2.5 mt-4 flex-wrap">
          <span className="text-[10px] text-text-dim font-bold uppercase tracking-wider shrink-0">{t("avatarColor")}</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_AVATAR_COLORS.map(preset => (
              <button
                key={preset.hex}
                onClick={() => onColorChange(preset.hex)}
                className={`w-5 h-5 rounded-full border transition cursor-pointer relative ${
                  selectedColor.toLowerCase() === preset.hex.toLowerCase()
                    ? "border-text scale-110 shadow-sm"
                    : "border-black/5 hover:scale-110"
                }`}
                style={{ backgroundColor: preset.hex }}
                title={preset.name}
              >
                {selectedColor.toLowerCase() === preset.hex.toLowerCase() && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px]" style={{ color: preset.text }}>✓</span>
                )}
              </button>
            ))}
            {/* Custom color */}
            <input
              type="color"
              value={selectedColor.startsWith("#") && selectedColor.length === 7 ? selectedColor : "#6366f1"}
              onChange={e => onColorChange(e.target.value)}
              title={t("customColor")}
              className="w-5 h-5 border border-border p-0 rounded-full cursor-pointer bg-transparent outline-none overflow-hidden ml-0.5"
            />
          </div>
        </div>
      )}
    </div>
  );
}
