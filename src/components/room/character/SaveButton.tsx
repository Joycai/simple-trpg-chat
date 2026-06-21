"use client";

import { useTranslations } from "next-intl";

export type SaveStatus = "idle" | "saving" | "success" | "error";

interface SaveButtonProps {
  status: SaveStatus;
  onClick: () => void;
  /** Label shown in the idle state. */
  idleLabel: string;
  /** Extra width/layout classes (e.g. "flex-1" or "w-full"). */
  className?: string;
}

/* Shared save button with built-in saving / success / error feedback states,
   used by the attributes, resources, and background save actions. */
export function SaveButton({ status, onClick, idleLabel, className = "" }: SaveButtonProps) {
  const t = useTranslations("character");
  return (
    <button onClick={onClick}
      disabled={status === "saving"}
      className={`text-white py-2 rounded-theme font-bold text-sm cursor-pointer transition flex items-center justify-center gap-1 ${className} ${
        status === "success" ? "bg-success" :
        status === "error" ? "bg-danger" :
        "bg-primary hover:bg-primary-hover"
      }`}>
      {status === "saving" ? (
        <>
          <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-1" />
          {t("saving") || "保存中..."}
        </>
      ) : status === "success" ? (
        <>✓ {t("saveSuccess") || "保存成功"}</>
      ) : status === "error" ? (
        <>× {t("saveFailed") || "保存失败"}</>
      ) : (
        idleLabel
      )}
    </button>
  );
}
