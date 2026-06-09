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
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async () => {
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
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      setError(t("exportFail") || errorMsg || "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-theme p-5 shadow-lg">
      <h3 className="font-bold text-text mb-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        {t("exportTitle") || "📥 导出回放数据"}
      </h3>
      <p className="text-xs text-text-muted mb-4">
        {t("exportDesc") || "导出房间完整消息记录、骰点、技能检定和角色状态快照，用于制作 Replay 视频。"}
      </p>

      {/* Format Selector — Radio Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setFormat("markdown")}
          disabled={exporting}
          className={`p-3 rounded-theme border text-left transition-all ${
            format === "markdown"
              ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-surface-alt hover:border-primary/30"
          }`}
        >
          <div className="text-lg mb-1">📝</div>
          <div className="text-sm font-bold text-text mb-0.5">Markdown</div>
          <div className="text-[10px] text-text-dim">{t("exportMdDesc") || "适合视频脚本和阅读"}</div>
        </button>
        <button
          onClick={() => setFormat("json")}
          disabled={exporting}
          className={`p-3 rounded-theme border text-left transition-all ${
            format === "json"
              ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
              : "border-border bg-surface-alt hover:border-primary/30"
          }`}
        >
          <div className="text-lg mb-1">📊</div>
          <div className="text-sm font-bold text-text mb-0.5">JSON</div>
          <div className="text-[10px] text-text-dim">{t("exportJsonDesc") || "适合程序化回放"}</div>
        </button>
      </div>

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-white py-3 rounded-theme font-bold text-sm transition flex items-center justify-center gap-2"
      >
        {exporting ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t("exporting") || "导出中..."}
          </>
        ) : (
          `${t("exportAction") || "导出"} ${format === "markdown" ? "Markdown" : "JSON"}`
        )}
      </button>

      {error && (
        <p className="text-xs text-danger mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
