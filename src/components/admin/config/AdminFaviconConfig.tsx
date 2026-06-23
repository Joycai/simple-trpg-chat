"use client";

import { useState, useRef, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, Upload, Save, RotateCcw } from "lucide-react";
import { updateSiteFavicon } from "@/app/actions/theme";

interface AdminFaviconConfigProps {
  initialFavicon: string;
}

export function AdminFaviconConfig({ initialFavicon }: AdminFaviconConfigProps) {
  const t = useTranslations("admin");
  const [previewUrl, setPreviewUrl] = useState(initialFavicon);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
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
      setMsg(t("saveSuccess"));
      setMsgType("success");
    } else {
      setMsg(t("saveFailed"));
      setMsgType("error");
    }
    setSaving(false);
  };

  return (
    <section className="bg-surface theme-border rounded-theme p-6 flex flex-col gap-5">
      <h3 className="font-bold text-text font-theme-display">{t("siteFaviconTitle")}</h3>

      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-theme border border-primary/40 bg-primary/5 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="favicon preview" className="w-12 h-12 object-contain" />
          ) : (
            <ImageIcon className="w-8 h-8 text-primary/60" />
          )}
        </div>

        <div className="flex flex-col gap-2">
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
            className="inline-flex items-center gap-2 border border-border bg-surface-alt hover:bg-surface text-text font-medium px-4 py-2.5 rounded-theme text-sm transition cursor-pointer disabled:opacity-50 w-fit"
          >
            <Upload className="w-4 h-4" />
            {t("uploadFavicon")}
          </button>
          <p className="text-xs text-text-dim">{t("faviconRecommend")}</p>
        </div>
      </div>

      {(pendingDataUrl || msg) && (
        <div className="flex items-center gap-3">
          {pendingDataUrl && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-primary-foreground font-medium px-3 py-1.5 rounded-theme text-xs transition cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? t("saving") : t("saveConfig")}
            </button>
          )}
          {previewUrl && (
            <button
              onClick={handleReset}
              disabled={saving}
              className="inline-flex items-center gap-1.5 border border-border hover:bg-surface-alt text-text-muted font-medium px-3 py-1.5 rounded-theme text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t("faviconReset")}
            </button>
          )}
          {msg && (
            <span className={`text-xs font-semibold ${msgType === "success" ? "text-success" : "text-danger"}`}>
              {msg}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
