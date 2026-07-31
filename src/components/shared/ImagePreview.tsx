"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/overlay-esc";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Download, RotateCcw, X } from "lucide-react";

interface ImagePreviewProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.2;

interface View {
  scale: number;
  x: number;
  y: number;
}

function filenameFromSrc(src: string): string {
  try {
    const clean = src.split("?")[0].split("#")[0];
    const seg = clean.substring(clean.lastIndexOf("/") + 1);
    return seg && /\.[a-z0-9]+$/i.test(seg) ? seg : "image.jpg";
  } catch {
    return "image.jpg";
  }
}

export function ImagePreview({ src, alt, onClose }: ImagePreviewProps) {
  const t = useTranslations("chat");
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  // Zoom by a multiplicative factor, keeping the point (cx, cy) under the cursor
  // fixed. When cx/cy are omitted, zoom around the viewport centre.
  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const px = cx ?? centerX;
    const py = cy ?? centerY;

    setView((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      const relX = px - centerX;
      const relY = py - centerY;
      return {
        scale: next,
        x: relX - (next * (relX - prev.x)) / prev.scale,
        y: relY - (next * (relY - prev.y)) / prev.scale,
      };
    });
  }, []);

  // Wheel zoom (native, non-passive so we can preventDefault page scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Escape closes via the shared overlay stack, so with a preview stacked on
  // another panel only the preview (topmost) closes — unless in fullscreen,
  // where Escape exits fullscreen first.
  useEscapeToClose(() => {
    if (document.fullscreenElement) return;
    onClose();
  });

  // Zoom keys. Lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        zoomBy(ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        zoomBy(1 / ZOOM_STEP);
      } else if (e.key === "0") {
        reset();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomBy, reset]);

  // Track fullscreen state.
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    const name = filenameFromSrc(src);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Cross-origin or fetch failure: fall back to opening in a new tab.
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }, [src]);

  // --- Pan (drag) when zoomed in ---
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || view.scale <= 1) return;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!lastPointer.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  };
  const onPointerUp = () => {
    lastPointer.current = null;
    setDragging(false);
  };

  const btn =
    "w-9 h-9 flex items-center justify-center rounded-full text-white/90 hover:bg-white/15 transition disabled:opacity-30 disabled:hover:bg-transparent";

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center overflow-hidden animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Toolbar */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-black/50 border border-white/15 rounded-full px-2 py-1 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={btn} onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={view.scale <= MIN_SCALE} title={t("zoomOut")} aria-label={t("zoomOut")}>
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-white/90 text-xs font-mono w-12 text-center select-none">
          {Math.round(view.scale * 100)}%
        </span>
        <button className={btn} onClick={() => zoomBy(ZOOM_STEP)} disabled={view.scale >= MAX_SCALE} title={t("zoomIn")} aria-label={t("zoomIn")}>
          <ZoomIn className="w-5 h-5" />
        </button>
        <button className={btn} onClick={reset} title={t("resetZoom")} aria-label={t("resetZoom")}>
          <RotateCcw className="w-[18px] h-[18px]" />
        </button>
        <div className="w-px h-5 bg-white/15 mx-1" />
        <button className={btn} onClick={toggleFullscreen} title={isFullscreen ? t("exitFullscreen") : t("fullscreen")} aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}>
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
        <button className={btn} onClick={handleDownload} title={t("download")} aria-label={t("download")}>
          <Download className="w-5 h-5" />
        </button>
      </div>

      {/* Close */}
      <button
        onClick={handleClose}
        title={t("closePreview")}
        aria-label={t("closePreview")}
        className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Zoomable/pannable preview driven by custom transform + pointer handlers on a
          user-supplied URL — next/image would fight the manual layout and can't optimize
          arbitrary/external sources anyway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onDoubleClick={(e) => (view.scale === 1 ? zoomBy(2, e.clientX, e.clientY) : reset())}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          cursor: view.scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          transition: dragging ? "none" : "transform 120ms ease-out",
        }}
        className="max-w-[92vw] max-h-[92vh] object-contain rounded-theme shadow-2xl select-none"
      />
    </div>,
    document.body
  );
}
