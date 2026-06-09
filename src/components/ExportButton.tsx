"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buildExportAction } from "@/app/actions/export";

interface ExportButtonProps {
  roomId: number;
  roomName: string;
}

export function ExportButton({ roomId, roomName }: ExportButtonProps) {
  const t = useTranslations("admin");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async (format: "markdown" | "json") => {
    setExporting(true);
    setError("");
    try {
      const data = await buildExportAction(roomId);
      const content = format === "markdown" ? data.markdown : data.json;
      const ext = format === "markdown" ? "md" : "json";
      const mime = format === "markdown" ? "text/markdown" : "application/json";

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `replay-${roomName}-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(t("exportFail") || e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-[#0f1425] p-5 rounded-xl border border-purple-500/20 shadow-lg">
      <h3 className="font-bold text-purple-200 mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        {t("exportTitle") || "📥 导出回放数据"}
      </h3>
      <p className="text-xs text-purple-400/60 mb-4">
        {t("exportDesc") || "导出房间完整消息记录、骰点、技能检定和角色状态快照，用于制作 Replay 视频。"}
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => handleExport("markdown")}
          disabled={exporting}
          className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white py-2.5 rounded-lg font-bold text-sm transition">
          {exporting ? (t("exporting") || "导出中...") : "📝 Markdown"}
        </button>
        <button
          onClick={() => handleExport("json")}
          disabled={exporting}
          className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 disabled:opacity-40 text-purple-300 py-2.5 rounded-lg font-bold text-sm transition">
          {exporting ? (t("exporting") || "导出中...") : "📊 JSON"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-400 mt-2">{error}</p>
      )}
      <p className="text-[10px] text-purple-400/30 mt-2">
        {t("exportHint") || "Markdown：适合人工阅读和视频脚本 · JSON：适合程序化回放"}
      </p>
    </div>
  );
}
