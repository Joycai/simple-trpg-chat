"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useOverlayTransition } from "@/lib/useOverlayTransition";

interface ImageCropperProps {
  /** Source image to crop. */
  file: File;
  /** Fixed aspect ratio (width / height). Omit for free-form crop. */
  aspectRatio?: number;
  /** Modal title; defaults to the i18n `cropper.title` value. */
  title?: string;
  /** Longest output side in pixels; the cropped image is downscaled to fit. */
  maxOutputSize?: number;
  /** Hard cap on output bytes; quality is auto-reduced to fit. */
  maxOutputBytes?: number;
  onCancel: () => void;
  /** Receives the cropped image as an `image/jpeg` data URL. */
  onConfirm: (dataUrl: string) => Promise<void> | void;
}

interface ImgGeom {
  /** Display offset (canvas px). */
  ox: number;
  oy: number;
  /** Display dimensions (canvas px). */
  dw: number;
  dh: number;
  /** Source dimensions (image px). */
  sw: number;
  sh: number;
}

type DragMode = null | "move" | "tl" | "tr" | "bl" | "br";

const DISPLAY_W = 420;
const DISPLAY_H = 320;
const HANDLE = 12;
const MIN_CROP = 32;

export function ImageCropper({
  file,
  aspectRatio,
  title,
  maxOutputSize = 1280,
  maxOutputBytes = 1024 * 1024,
  onCancel,
  onConfirm,
}: ImageCropperProps) {
  const t = useTranslations("cropper");
  const tCommon = useTranslations("common");
  const { close, panelRef, backdropRef, panelClass } = useOverlayTransition(onCancel);

  const [src, setSrc] = useState<string | null>(null);
  const [geom, setGeom] = useState<ImgGeom | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  /* Load file → dataURL → measure → compute initial crop. */
  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (cancelled) return;
      const data = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const scale = Math.min(DISPLAY_W / img.width, DISPLAY_H / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const ox = (DISPLAY_W - dw) / 2;
        const oy = (DISPLAY_H - dh) / 2;
        let cw: number;
        let ch: number;
        if (aspectRatio && aspectRatio > 0) {
          if (dw / dh > aspectRatio) {
            ch = dh;
            cw = ch * aspectRatio;
          } else {
            cw = dw;
            ch = cw / aspectRatio;
          }
        } else {
          cw = dw;
          ch = dh;
        }
        imgRef.current = img;
        setSrc(data);
        setGeom({ ox, oy, dw, dh, sw: img.width, sh: img.height });
        setCrop({ x: ox + (dw - cw) / 2, y: oy + (dh - ch) / 2, w: cw, h: ch });
      };
      img.onerror = () => {
        if (cancelled) return;
        setError(t("errorDecode"));
      };
      img.src = data;
    };
    reader.onerror = () => {
      if (cancelled) return;
      setError(t("errorDecode"));
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
    };
  }, [file, aspectRatio, t]);

  /* Redraw whenever crop or image changes. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !geom) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { ox, oy, dw, dh } = geom;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, DISPLAY_W, DISPLAY_H);
    ctx.drawImage(img, ox, oy, dw, dh);

    /* Dim the area outside the crop. */
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    if (crop.y > 0) ctx.fillRect(0, 0, DISPLAY_W, crop.y);
    if (crop.x > 0) ctx.fillRect(0, crop.y, crop.x, crop.h);
    if (crop.x + crop.w < DISPLAY_W) ctx.fillRect(crop.x + crop.w, crop.y, DISPLAY_W - (crop.x + crop.w), crop.h);
    if (crop.y + crop.h < DISPLAY_H) ctx.fillRect(0, crop.y + crop.h, DISPLAY_W, DISPLAY_H - (crop.y + crop.h));

    /* Crop border + thirds grid + corner handles. */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = crop.x + (crop.w * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, crop.y);
      ctx.lineTo(x, crop.y + crop.h);
      ctx.stroke();
      const y = crop.y + (crop.h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(crop.x, y);
      ctx.lineTo(crop.x + crop.w, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffffff";
    const corners: Array<[number, number]> = [
      [crop.x - HANDLE / 2, crop.y - HANDLE / 2],
      [crop.x + crop.w - HANDLE / 2, crop.y - HANDLE / 2],
      [crop.x - HANDLE / 2, crop.y + crop.h - HANDLE / 2],
      [crop.x + crop.w - HANDLE / 2, crop.y + crop.h - HANDLE / 2],
    ];
    for (const [cx, cy] of corners) ctx.fillRect(cx, cy, HANDLE, HANDLE);
  }, [crop, geom]);

  const bounds = useMemo(() => {
    if (!geom) return null;
    return { left: geom.ox, top: geom.oy, right: geom.ox + geom.dw, bottom: geom.oy + geom.dh };
  }, [geom]);

  const hitTest = useCallback((px: number, py: number): DragMode => {
    const inHandle = (cx: number, cy: number) =>
      px >= cx - HANDLE && px <= cx + HANDLE && py >= cy - HANDLE && py <= cy + HANDLE;
    if (inHandle(crop.x, crop.y)) return "tl";
    if (inHandle(crop.x + crop.w, crop.y)) return "tr";
    if (inHandle(crop.x, crop.y + crop.h)) return "bl";
    if (inHandle(crop.x + crop.w, crop.y + crop.h)) return "br";
    if (px >= crop.x && px <= crop.x + crop.w && py >= crop.y && py <= crop.y + crop.h) return "move";
    return null;
  }, [crop]);

  const dragRef = useRef<{ mode: DragMode; sx: number; sy: number; start: typeof crop } | null>(null);

  const cursorFor = useCallback((mode: DragMode): string => {
    if (mode === "move") return "move";
    if (mode === "tl" || mode === "br") return "nwse-resize";
    if (mode === "tr" || mode === "bl") return "nesw-resize";
    return "default";
  }, []);

  const [cursor, setCursor] = useState<string>("default");

  const toCanvasPx = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * DISPLAY_W,
      y: ((clientY - rect.top) / rect.height) * DISPLAY_H,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!bounds) return;
    const { x, y } = toCanvasPx(e.clientX, e.clientY);
    const mode = hitTest(x, y);
    if (!mode) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode, sx: x, sy: y, start: { ...crop } };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!bounds) return;
    const { x, y } = toCanvasPx(e.clientX, e.clientY);
    const active = dragRef.current;
    if (!active) {
      setCursor(cursorFor(hitTest(x, y)));
      return;
    }
    const dx = x - active.sx;
    const dy = y - active.sy;
    const { start, mode } = active;

    if (mode === "move") {
      const nx = Math.min(Math.max(bounds.left, start.x + dx), bounds.right - start.w);
      const ny = Math.min(Math.max(bounds.top, start.y + dy), bounds.bottom - start.h);
      setCrop({ ...start, x: nx, y: ny });
      return;
    }

    /* Resize: anchor the opposite corner, optionally locked to aspectRatio. */
    const sx2 = start.x + start.w;
    const sy2 = start.y + start.h;
    const anchorX = mode === "tl" || mode === "bl" ? sx2 : start.x;
    const anchorY = mode === "tl" || mode === "tr" ? sy2 : start.y;
    let nx2 = mode === "tl" || mode === "bl" ? start.x + dx : sx2 + dx;
    let ny2 = mode === "tl" || mode === "tr" ? start.y + dy : sy2 + dy;
    nx2 = Math.min(Math.max(bounds.left, nx2), bounds.right);
    ny2 = Math.min(Math.max(bounds.top, ny2), bounds.bottom);
    let w = Math.abs(nx2 - anchorX);
    let h = Math.abs(ny2 - anchorY);
    if (aspectRatio && aspectRatio > 0) {
      const ratio = aspectRatio;
      /* Lock ratio: prefer the larger drag axis, then clamp by the other. */
      if (w / h > ratio) h = w / ratio;
      else w = h * ratio;
      /* Re-clamp against the image bounds via the anchored corner. */
      const wByX = mode === "tl" || mode === "bl" ? anchorX - bounds.left : bounds.right - anchorX;
      const hByY = mode === "tl" || mode === "tr" ? anchorY - bounds.top : bounds.bottom - anchorY;
      const maxW = Math.min(wByX, hByY * ratio);
      const maxH = Math.min(hByY, wByX / ratio);
      w = Math.min(w, maxW);
      h = Math.min(h, maxH);
    }
    w = Math.max(MIN_CROP, w);
    h = Math.max(MIN_CROP, h);
    const finalX = mode === "tl" || mode === "bl" ? anchorX - w : anchorX;
    const finalY = mode === "tl" || mode === "tr" ? anchorY - h : anchorY;
    setCrop({ x: finalX, y: finalY, w, h });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragRef.current = null;
    }
  };

  /* Crop → JPEG dataURL, downscaled and quality-stepped to fit byte cap. */
  const exportCropped = (): string | null => {
    const img = imgRef.current;
    if (!img || !geom) return null;
    const scale = geom.sw / geom.dw;
    const sx = (crop.x - geom.ox) * scale;
    const sy = (crop.y - geom.oy) * scale;
    const sw = crop.w * scale;
    const sh = crop.h * scale;
    const maxSide = Math.max(sw, sh);
    const outScale = maxSide > maxOutputSize ? maxOutputSize / maxSide : 1;
    const ow = Math.round(sw * outScale);
    const oh = Math.round(sh * outScale);
    const out = document.createElement("canvas");
    out.width = ow;
    out.height = oh;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
    const QUALITIES = [0.9, 0.82, 0.72, 0.6, 0.5, 0.4];
    for (const q of QUALITIES) {
      const url = out.toDataURL("image/jpeg", q);
      /* base64 inflates by ~4/3; "data:image/jpeg;base64,..." prefix is small. */
      const approxBytes = Math.floor(((url.length - "data:image/jpeg;base64,".length) * 3) / 4);
      if (approxBytes <= maxOutputBytes) return url;
    }
    /* Last-resort: shrink dimensions further then re-encode at 0.4. */
    const shrink = Math.max(0.4, Math.sqrt(maxOutputBytes / (ow * oh * 3)));
    out.width = Math.max(1, Math.round(ow * shrink));
    out.height = Math.max(1, Math.round(oh * shrink));
    const ctx2 = out.getContext("2d");
    if (!ctx2) return null;
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", 0.4);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setError(null);
    const url = exportCropped();
    if (!url) {
      setError(t("errorEncode"));
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorEncode"));
      setSubmitting(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={backdropRef} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        ref={panelRef} className={`bg-surface rounded-theme theme-border p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-border ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-xl text-text font-theme-display">{title ?? t("title")}</h3>
          <button onClick={close} aria-label={tCommon("close")}
            className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-text-muted mb-3">{t("dragHint")}</p>

        <div className="relative bg-black/40 rounded-theme overflow-hidden border border-border">
          <canvas
            ref={canvasRef}
            width={DISPLAY_W}
            height={DISPLAY_H}
            className="w-full h-auto block touch-none select-none"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {!src && (
            <div className="absolute inset-0 flex items-center justify-center text-text-muted">
              <Icons.Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-theme border border-danger/40 bg-danger/10 text-sm text-danger">
            <Icons.AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={close}
            className="px-5 py-2.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt text-sm font-bold cursor-pointer transition">
            {tCommon("cancel")}
          </button>
          <button onClick={handleConfirm} disabled={!src || submitting}
            className="btn-primary px-6 py-2.5 rounded-theme bg-gradient-to-b from-primary to-primary/80 text-primary-foreground font-bold text-sm cursor-pointer transition hover:brightness-110 disabled:opacity-40 shadow-[var(--theme-glow)] inline-flex items-center gap-2">
            {submitting ? <Icons.Loader2 className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
            {submitting ? t("uploading") : t("confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
