"use client";

import { useState } from "react";
import { HostAiSettings } from "./HostAiSettings";

export function AiSettingsButton() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowSettings(true)}
        className="p-1.5 rounded-full hover:bg-surface-alt text-text-dim hover:text-text transition-all duration-200"
        title="AI 配置"
      >
        🤖
      </button>
      {showSettings && <HostAiSettings onClose={() => setShowSettings(false)} />}
    </>
  );
}
