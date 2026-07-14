"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageOff, ImagePlus, Loader2, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteRoomBackgroundAction,
  listRoomBackgroundsAction,
  renameRoomBackgroundAction,
  setRoomBackgroundAction,
  type RoomBackgroundView,
} from "@/app/actions/background";

/** Client-side mirror of the server limits (server re-validates everything). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_COUNT = 12;
const ACCEPTED_MIMES = "image/jpeg,image/png,image/webp";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/**
 * Host-side background management grid (RoomSettings → 背景图 tab).
 * Upload goes through POST /api/rooms/[id]/backgrounds (multipart);
 * activate/rename/delete are server actions. Semantic tokens only.
 */
export function RoomBackgroundManager({ roomId }: { roomId: number }) {
  const t = useTranslations("roomBackground");
  const router = useRouter();
  const [items, setItems] = useState<RoomBackgroundView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const res = await listRoomBackgroundsAction(roomId);
    if (res.success) {
      setItems(res.backgrounds);
      setError("");
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [roomId]);

  // Initial load — promise-chained so no setState runs synchronously in the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    listRoomBackgroundsAction(roomId).then((res) => {
      if (cancelled) return;
      if (res.success) setItems(res.backgrounds);
      else setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const activeId = items.find((b) => b.active)?.id ?? null;
  const atCap = items.length >= MAX_COUNT;

  const handleUpload = async (file: File) => {
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t("errorTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch(`/api/rooms/${roomId}/backgrounds`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || t("errorUploadFailed"));
      } else {
        await reload();
      }
    } catch {
      setError(t("errorUploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleActivate = async (id: number | null) => {
    if (id === activeId) return;
    setBusyId(id ?? -1);
    const res = await setRoomBackgroundAction(roomId, id);
    if (!res.success) setError(res.error);
    await reload();
    setBusyId(null);
    router.refresh();
  };

  const handleRename = async (id: number) => {
    const res = await renameRoomBackgroundAction(roomId, id, renameDraft);
    if (!res.success) setError(res.error);
    setRenamingId(null);
    await reload();
  };

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(null);
    setBusyId(id);
    const res = await deleteRoomBackgroundAction(roomId, id);
    if (!res.success) setError(res.error);
    await reload();
    setBusyId(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">{t("managerHint")}</p>
        <span className="text-xs text-text-dim font-mono shrink-0">
          {items.length}/{MAX_COUNT}
        </span>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-text text-sm px-3 py-2 rounded-theme flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIMES}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <button
          type="button"
          disabled={uploading || atCap}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-theme border border-border text-text hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4 text-primary" />}
          {uploading ? t("uploading") : t("upload")}
        </button>
        <button
          type="button"
          disabled={activeId === null || busyId !== null}
          onClick={() => handleActivate(null)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-theme border border-border text-text-muted hover:text-text hover:border-text-muted disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
        >
          <ImageOff className="w-4 h-4" />
          {t("turnOff")}
        </button>
      </div>
      {atCap && <p className="text-xs text-warning">{t("capReached", { max: MAX_COUNT })}</p>}
      <p className="text-xs text-text-dim">{t("uploadHint")}</p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-text-dim">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-dim py-6 text-center border border-dashed border-border rounded-theme">
          {t("empty")}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {items.map((bg) => {
            const isRenaming = renamingId === bg.id;
            const isConfirmingDelete = confirmDeleteId === bg.id;
            return (
              <div
                key={bg.id}
                className={`group relative rounded-theme border overflow-hidden transition ${
                  bg.active ? "border-primary shadow-[var(--theme-glow)]" : "border-border hover:border-text-muted"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleActivate(bg.id)}
                  disabled={busyId !== null}
                  title={bg.active ? t("activeBadge") : t("activate")}
                  className="block w-full cursor-pointer disabled:cursor-wait"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authed same-origin API URL; next/image can't optimize it */}
                  <img src={bg.url} alt={bg.title || ""} className="w-full aspect-video object-cover" loading="lazy" />
                </button>

                {bg.active && (
                  <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-theme">
                    <Check className="w-3 h-3" /> {t("activeBadge")}
                  </span>
                )}
                {busyId === bg.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-bg/50">
                    <Loader2 className="w-5 h-5 animate-spin text-text" />
                  </span>
                )}

                <div className="px-2 py-1.5 bg-surface-alt/60 border-t border-border flex items-center gap-1.5">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      maxLength={50}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(bg.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => handleRename(bg.id)}
                      className="flex-1 min-w-0 text-xs bg-input-bg border border-input-border rounded-theme px-1.5 py-0.5 text-text outline-none focus:border-primary"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 text-xs text-text truncate" title={bg.title || t("untitled")}>
                      {bg.title || <span className="text-text-dim">{t("untitled")}</span>}
                    </span>
                  )}
                  <span className="text-[10px] text-text-dim font-mono shrink-0">{formatSize(bg.sizeBytes)}</span>
                  {!isRenaming && (
                    <>
                      <button
                        type="button"
                        title={t("rename")}
                        aria-label={t("rename")}
                        onClick={() => {
                          setRenamingId(bg.id);
                          setRenameDraft(bg.title || "");
                          setConfirmDeleteId(null);
                        }}
                        className="text-text-dim hover:text-text transition cursor-pointer shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title={isConfirmingDelete ? t("deleteConfirm") : t("delete")}
                        aria-label={isConfirmingDelete ? t("deleteConfirm") : t("delete")}
                        onClick={() =>
                          isConfirmingDelete ? handleDelete(bg.id) : setConfirmDeleteId(bg.id)
                        }
                        onBlur={() => setConfirmDeleteId(null)}
                        className={`transition cursor-pointer shrink-0 ${
                          isConfirmingDelete ? "text-danger animate-pulse" : "text-text-dim hover:text-danger"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
