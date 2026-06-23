"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buildExportAction } from "@/app/actions/export";
import { Icons } from "@/components/shared/icons";

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
      setError(t("exportFail") || errorMsg);
    } finally {
      setExporting(false);
    }
  };

  const formats = [
    { key: "markdown" as const, label: "Markdown", desc: t("exportMdDesc"), Icon: Icons.FileText },
    { key: "json" as const, label: "JSON", desc: t("exportJsonDesc"), Icon: Icons.Braces },
  ];

  return (
    <div className="bg-surface theme-border rounded-theme p-6 shadow-2xl w-full">
      <h3 className="font-bold text-text mb-2 flex items-center gap-2.5 text-lg font-theme-display">
        <span className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--theme-accent)/0.6)]" />
        {t("exportTitle")}
      </h3>
      <p className="text-sm text-text-muted mb-5 leading-relaxed">
        {t("exportDesc")}
      </p>

      {/* Format selector — radio cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {formats.map(({ key, label, desc, Icon }) => {
          const active = format === key;
          return (
            <button key={key} onClick={() => setFormat(key)} disabled={exporting}
              className={`p-4 rounded-theme border text-left transition cursor-pointer ${
                active ? "border-primary/60 bg-primary/10 shadow-[var(--theme-glow)]" : "border-border bg-surface-alt/40 hover:border-primary/30"
              }`}>
              <Icon className={`w-6 h-6 mb-2 ${active ? "text-primary" : "text-text-muted"}`} />
              <div className="text-base font-bold text-text mb-0.5">{label}</div>
              <div className="text-xs text-text-dim">{desc}</div>
            </button>
          );
        })}
      </div>

      {/* Export button */}
      <button onClick={handleExport} disabled={exporting}
        className="w-full py-3.5 rounded-theme font-bold text-sm transition hover:brightness-110 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-[var(--theme-glow)]">
        {exporting ? (
          <>
            <span className="animate-spin inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full" />
            {t("exporting")}
          </>
        ) : (
          <>
            <Icons.Download className="w-4 h-4" />
            {`${t("exportAction")} ${format === "markdown" ? "Markdown" : "JSON"}`}
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-danger mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
