"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { getContrastColor, PRESET_AVATAR_COLORS } from "@/lib/ui/avatar-colors";

/**
 * Profile band — avatar + colour. Sits ABOVE the tab bar, so it must not be
 * tab-scoped: it used to render only on the 属性 tab, and unmounting it
 * shifted the tabs and the whole pane up by its height on every switch to
 * 技能 / 背景. Keeping it mounted costs ~96px of vertical room on those tabs
 * and buys a stable layout.
 */
export function AvatarColorBand({
  nickname,
  selectedColor,
  avatarSrc,
  onPickFile,
  onColorChange,
}: {
  nickname: string;
  selectedColor: string;
  avatarSrc: string | null;
  /** A picked image, handed to the cropper. */
  onPickFile: (file: File) => void;
  onColorChange: (hex: string) => void;
}) {
  const t = useTranslations("character");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="shrink-0 border-b border-border px-6 py-4 flex items-center gap-4">
      <div className="relative shrink-0">
        <div className="w-16 h-16 rounded-theme overflow-hidden flex items-center justify-center border-2"
          style={{ borderColor: selectedColor, boxShadow: `0 0 12px ${selectedColor}55` }}>
          {avatarSrc
            // Avatar is a base64 data URL — next/image can't optimize these.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarSrc} alt={nickname} className="w-full h-full object-cover" />
            : <span className="w-full h-full flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: selectedColor, color: getContrastColor(selectedColor) }}>{nickname.charAt(0).toUpperCase()}</span>}
        </div>
        <button onClick={() => inputRef.current?.click()} title={t("changeAvatar")}
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-surface flex items-center justify-center cursor-pointer">
          <Icons.Pencil className="w-3 h-3" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset value so re-selecting the same file re-fires onChange.
            e.target.value = "";
            if (file) onPickFile(file);
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-muted mb-2">{t("avatarColor")}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESET_AVATAR_COLORS.map(p => (
            <button key={p.hex} onClick={() => onColorChange(p.hex)} title={p.name}
              className={`w-7 h-7 rounded-full transition cursor-pointer ${
                selectedColor.toLowerCase() === p.hex.toLowerCase()
                  ? "ring-2 ring-offset-2 ring-offset-surface ring-primary scale-105" : "hover:scale-110"
              }`}
              style={{ backgroundColor: p.hex }} />
          ))}
          <label title={t("customColor")}
            className="w-7 h-7 rounded-full border border-dashed border-border flex items-center justify-center cursor-pointer text-text-muted hover:text-text hover:border-primary/50 transition">
            <Icons.Plus className="w-3.5 h-3.5" />
            <input type="color"
              value={selectedColor.startsWith("#") && selectedColor.length === 7 ? selectedColor : "#6366f1"}
              onChange={e => onColorChange(e.target.value)}
              className="absolute w-0 h-0 opacity-0" />
          </label>
        </div>
      </div>
    </div>
  );
}
