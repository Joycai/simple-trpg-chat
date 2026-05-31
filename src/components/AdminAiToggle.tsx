"use client";

import { useState } from "react";
import { updateSystemConfig } from "@/app/actions/ai";

interface AdminAiToggleProps {
  initialEnabled: boolean;
}

export function AdminAiToggle({ initialEnabled }: AdminAiToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    const newState = !enabled;
    setSaving(true);
    try {
      await updateSystemConfig("ai_enabled", newState ? "true" : "false");
      setEnabled(newState);
    } catch (e) {
      console.error("Failed to toggle AI:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface p-6 rounded-theme shadow-sm border">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-text text-lg mb-1">🤖 AI 功能</h3>
          <p className="text-sm text-text-muted">
            开启后，主持人可以在设置中配置 OpenAI 兼容 API，用于智能线索整理和导入
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
            enabled ? "bg-primary" : "bg-text-muted/30"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${
              enabled ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
