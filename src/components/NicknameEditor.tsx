"use client";

import { useState } from "react";

interface NicknameEditorProps {
  currentNickname: string;
  onSave: (nickname: string) => Promise<void>;
}

export function NicknameEditor({ currentNickname, onSave }: NicknameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNickname);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!value.trim() || value === currentNickname) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } catch {
      // revert
      setValue(currentNickname);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(currentNickname);
          setEditing(true);
        }}
        className="text-sm text-gray-500 hover:text-blue-500 underline underline-offset-2 transition"
        title="点击修改昵称"
      >
        ✏️ {currentNickname}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        className="px-2 py-1 border rounded text-sm w-32 outline-none focus:ring-2 focus:ring-blue-300"
        maxLength={20}
        disabled={saving}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {saving ? "..." : "✓"}
      </button>
    </div>
  );
}
