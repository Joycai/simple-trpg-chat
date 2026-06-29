"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { getStickerManifestAction } from "@/app/actions/sticker";
import type { StickerPack } from "@/lib/stickers";

interface StickerPickerProps {
  /** Called with the chosen sticker's path URL. */
  onPick: (url: string) => void;
  /** Close the popover (e.g. after a pick or outside click). */
  onClose: () => void;
}

/**
 * Popover that lists curated sticker packs (scanned from disk) and lets the user
 * pick one to send. Packs are fetched once on mount; an empty manifest renders
 * an empty-state hint.
 */
/** Stickers shown per page (6 columns × 4 rows). */
const PAGE_SIZE = 24;

export function StickerPicker({ onPick, onClose }: StickerPickerProps) {
  const t = useTranslations("chat");
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [activePack, setActivePack] = useState(0);
  const [page, setPage] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getStickerManifestAction()
      .then((data) => {
        if (alive) setPacks(data);
      })
      .catch(() => {
        if (alive) setPacks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const current = packs?.[activePack];
  const pageCount = current ? Math.max(1, Math.ceil(current.stickers.length / PAGE_SIZE)) : 1;
  const pageStickers = current ? current.stickers.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : [];

  const selectPack = (i: number) => {
    setActivePack(i);
    setPage(0); // start each pack at its first page
  };

  return (
    <div
      ref={rootRef}
      className="absolute bottom-12 right-0 z-30 w-60 sm:w-72 max-w-[calc(100vw-1rem)] max-h-80 flex flex-col rounded-theme border border-border bg-surface shadow-lg overflow-hidden"
      role="dialog"
      aria-label={t("stickerPanelTitle")}
    >
      {packs === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-text-muted">
          <Icons.Loader2 className="w-4 h-4 animate-spin" />
          <span>{t("stickerLoading")}</span>
        </div>
      ) : packs.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8 px-4 text-center text-xs text-text-muted">
          <Icons.Smile className="w-5 h-5" />
          <span>{t("stickerEmpty")}</span>
        </div>
      ) : (
        <>
          {/* Sticker grid for the active pack's current page */}
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-6 gap-1 content-start">
            {pageStickers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.url)}
                className="aspect-square flex items-center justify-center rounded-theme hover:bg-surface-alt transition p-0.5 cursor-pointer"
                title={s.id}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={s.id} loading="lazy" className="max-w-full max-h-full object-contain" />
              </button>
            ))}
          </div>

          {/* Pager (only when the active pack spans multiple pages) */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-border py-1 text-xs text-text-muted">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded-theme hover:bg-surface-alt hover:text-text transition disabled:opacity-30 disabled:cursor-default cursor-pointer"
                aria-label={t("stickerPrevPage")}
              >
                <Icons.ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums select-none">{page + 1} / {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="p-1 rounded-theme hover:bg-surface-alt hover:text-text transition disabled:opacity-30 disabled:cursor-default cursor-pointer"
                aria-label={t("stickerNextPage")}
              >
                <Icons.ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Pack tabs */}
          {packs.length > 1 && (
            <div className="flex items-center gap-1 border-t border-border p-1.5 overflow-x-auto">
              {packs.map((p, i) => (
                <button
                  key={p.pack}
                  type="button"
                  onClick={() => selectPack(i)}
                  className={`px-2 py-1 rounded-theme text-xs whitespace-nowrap transition cursor-pointer ${
                    i === activePack
                      ? "bg-primary/15 text-primary"
                      : "text-text-muted hover:bg-surface-alt hover:text-text"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
