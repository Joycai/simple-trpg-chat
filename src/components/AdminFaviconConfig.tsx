"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, Save, RotateCcw } from "lucide-react";
import { updateSiteFavicon } from "@/app/actions/theme";

interface AdminFaviconConfigProps {
  initialFavicon: string;
}

export function AdminFaviconConfig({ initialFavicon }: AdminFaviconConfigProps) {
  const t = useTranslations("admin");
  const [previewUrl, setPreviewUrl] = useState(initialFavicon);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      setMsg(t("faviconFileTooLarge"));
      setMsgType("error");
      return;
    }

    setFileName(file.name);
    setMsg("");

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setPendingDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!pendingDataUrl) return;
    setSaving(true);
    setMsg("");
    const result = await updateSiteFavicon(pendingDataUrl);
    if (result.success) {
      setMsg(t("saveSuccess"));
      setMsgType("success");
      setPendingDataUrl(null);
    } else {
      setMsg(t("saveFailed"));
      setMsgType("error");
    }
    setSaving(false);
  };

  const handleReset = async () => {
    setSaving(true);
    setMsg("");
    const result = await updateSiteFavicon("");
    if (result.success) {
      setPreviewUrl("");
      setPendingDataUrl(null);
      setFileName("");
      setMsg(t("saveSuccess"));
      setMsgType("success");
    } else {
      setMsg(t("saveFailed"));
      setMsgType("error");
    }
    setSaving(false);
  };

  return (
    <section className="bg-surface p-6 rounded-xl border border-border shadow-lg flex flex-col gap-6 transition-all duration-200 hover:border-purple-500/20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-lg shrink-0">
          <ImageIcon className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text text-lg mb-1">
            {t("editSiteFavicon")}
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            {t("editSiteFaviconDesc")}
          </p>
        </div>
      </div>

      <div className="border-t border-border/60" />

      {/* Preview + file picker */}
      <div className="flex items-center gap-5">
        <div className="shrink-0">
          <p className="text-xs font-bold text-text-muted mb-2">{t("faviconPreview")}</p>
          <div className="w-16 h-16 rounded-lg border border-border bg-bg flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="favicon preview" className="w-10 h-10 object-contain" />
            ) : (
              <ImageIcon className="w-8 h-8 text-text-dim" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/x-icon,image/svg+xml"
            onChange={handleFileChange}
            disabled={saving}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="inline-flex items-center gap-2 border border-border bg-bg hover:bg-surface-hover text-text font-semibold px-4 py-2 rounded-lg text-sm transition cursor-pointer disabled:opacity-50 w-fit"
          >
            <ImageIcon className="w-4 h-4" />
            {t("faviconChooseFile")}
          </button>
          {fileName && (
            <p className="text-xs text-text-muted">{fileName}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving || !pendingDataUrl}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-text-dim text-white font-bold px-4 py-2 rounded-lg text-sm transition shadow-md hover:shadow-lg disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? t("saving") : t("saveConfig")}
        </button>

        <button
          onClick={handleReset}
          disabled={saving || (!previewUrl && !pendingDataUrl)}
          className="inline-flex items-center gap-2 border border-border hover:bg-surface-hover text-text-muted font-semibold px-4 py-2 rounded-lg text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" />
          {t("faviconReset")}
        </button>

        {msg && (
          <span className={`text-xs font-semibold animate-fade-in ${msgType === "success" ? "text-success" : "text-danger"}`}>
            {msg}
          </span>
        )}
      </div>
    </section>
  );
}
