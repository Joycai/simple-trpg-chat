"use client";

import { useState } from "react";
import { updateRoomSettingsAction } from "@/app/actions/room";
import { THEME_LIST } from "@/themes/types";
import type { ThemeId } from "@/themes/types";
import { useRouter } from "next/navigation";

interface RoomSettingsProps {
  roomId: number;
  roomName: string;
  currentTheme: ThemeId;
  currentDiceRules?: string;
  onClose: () => void;
}

export function RoomSettings({ roomId, roomName, currentTheme, currentDiceRules, onClose }: RoomSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(currentTheme);
  const [selectedDiceRules, setSelectedDiceRules] = useState<string>(currentDiceRules || "basic");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const formData = new FormData();
      formData.set("theme", selectedTheme);
      formData.set("diceRules", selectedDiceRules);
      
      await updateRoomSettingsAction(roomId, formData);
      
      onClose();
      router.refresh();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-lg shadow-2xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-text">⚙️ 房间设置</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <p className="text-sm text-text-muted mb-4">{roomName} 的房间设置</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">房间主题</label>
            <div className="grid gap-2">
              {THEME_LIST.map((theme) => (
                <label
                  key={theme.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedTheme === theme.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-text-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={theme.id}
                    checked={selectedTheme === theme.id}
                    onChange={() => setSelectedTheme(theme.id as ThemeId)}
                    className="accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text">{theme.name}</div>
                    <div className="text-xs text-text-dim mt-0.5">{theme.description}</div>
                  </div>
                  {/* Theme preview dot */}
                  <div
                    className={`w-6 h-6 rounded-full border-2 shrink-0 ${
                      theme.id === "default" ? "bg-gray-100 border-gray-300" : ""
                    }`}
                    style={
                      theme.id === "parchment"
                        ? { backgroundColor: "#fdf6e3", borderColor: "#c4a484" }
                        : theme.id === "cthulhu"
                        ? { backgroundColor: "#0f172a", borderColor: "#5eead4" }
                        : theme.id === "shrine"
                        ? { backgroundColor: "#2d1f14", borderColor: "#c44040" }
                        : undefined
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Dice rules */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-text-dim font-medium">投点规则</label>
            <select
              name="diceRules"
              value={selectedDiceRules}
              onChange={(e) => setSelectedDiceRules(e.target.value)}
              className="p-2.5 border border-input-border bg-input-bg rounded outline-none focus:ring-2 focus:ring-primary/50 text-text text-sm"
            >
              <option value="basic">📊 Basic — 基础骰点</option>
              <option value="coc7th">🐙 COC 7th — 大成功/大失败判定</option>
            </select>
            <p className="text-xs text-text-muted">COC 7th 启用 .rc 检定的 01-05 大成功🟢 / 96-100 大失败🔴</p>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-text text-sm px-3 py-2 rounded">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold text-sm transition"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
