"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Images, RefreshCw, Trash2, ChevronDown, Image as ImageIcon, AlertTriangle } from "lucide-react";
import {
  getImageCacheStatsAction,
  cleanupImageCacheAction,
  type ImageCacheStatsView,
  type RoomImageUsageView,
} from "@/app/actions/image-cache";
import type { CleanupRange } from "@/lib/image-cache";
import { formatBytes, splitBytes } from "@/lib/format-bytes";

/** Bar tint tiers matching the dashboard's warm→cool gradient across rooms. */
const BAR_TINTS = ["bg-primary", "bg-accent", "bg-warning", "bg-success", "bg-ai"];

export function AdminImageCacheManager({ initialStats }: { initialStats: ImageCacheStatsView }) {
  const t = useTranslations("admin");
  const [stats, setStats] = useState<ImageCacheStatsView>(initialStats);
  const [scanning, setScanning] = useState(false);
  /** Key of the cleanup currently running, e.g. `"all:7d"` or `"12:all"`. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Room id whose per-room cleanup panel is expanded. */
  const [expanded, setExpanded] = useState<number | null>(null);
  /** Explicit opt-in: cleanup also deletes room backgrounds. Default OFF —
      backgrounds are host prep material, not an aging cache. */
  const [includeBackgrounds, setIncludeBackgrounds] = useState(false);

  const rescan = async () => {
    setScanning(true);
    try {
      setStats(await getImageCacheStatsAction());
    } catch (e) {
      console.error("Failed to rescan image cache:", e);
    } finally {
      setScanning(false);
    }
  };

  const cleanup = async (scope: "all" | number, range: CleanupRange, key: string) => {
    let confirmMsg =
      range === "all"
        ? scope === "all"
          ? t("imageCacheConfirmAllRooms")
          : t("imageCacheConfirmRoomAll")
        : t("imageCacheConfirmRange");
    if (includeBackgrounds) {
      confirmMsg += "\n\n" + t("imageCacheConfirmBackgrounds");
    }
    if (!window.confirm(confirmMsg)) return;
    setBusy(key);
    try {
      const res = await cleanupImageCacheAction(scope, range, includeBackgrounds);
      setStats(res.stats);
      setExpanded(null);
    } catch (e) {
      console.error("Failed to clean image cache:", e);
    } finally {
      setBusy(null);
    }
  };

  const { value, unit } = splitBytes(stats.totalBytes);
  const pct = stats.quotaBytes > 0 ? Math.min(100, (stats.totalBytes / stats.quotaBytes) * 100) : 0;
  const maxBytes = stats.rooms[0]?.bytes || 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text font-theme-display flex items-center gap-2.5">
            <Images className="w-6 h-6 text-primary" />
            {t("imageCacheTitle")}
          </h1>
          <p className="text-sm text-text-muted mt-1">{t("imageCacheSubtitle")}</p>
        </div>
        <button
          onClick={rescan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-theme border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-alt transition disabled:opacity-50 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
          <span className="text-sm font-medium">{t("imageCacheRescan")}</span>
        </button>
      </div>

      {/* Summary + batch cleanup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Usage summary */}
        <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg flex flex-col justify-center gap-3">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold font-theme-display text-primary leading-none">{value}</span>
            <span className="text-sm text-text-muted mb-0.5">{unit}</span>
            <span className="text-xs text-text-dim mb-1">
              / {formatBytes(stats.quotaBytes)} {t("imageCacheQuota")}
            </span>
          </div>
          <div className="w-full bg-border/40 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-warning transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Images className="w-3.5 h-3.5 text-text-dim" />
              {t("imageCacheCount", { count: stats.totalCount })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-text-dim">
              {t("imageCacheRoomsCount", { count: stats.roomCount })}
            </span>
          </div>
          {/* Room backgrounds — separate ledger, excluded from routine cleanup. */}
          <div className="flex items-center gap-2 text-xs text-text-muted border-t border-border/60 pt-2.5">
            <ImageIcon className="w-3.5 h-3.5 text-text-dim shrink-0" />
            <span>
              {t("imageCacheBackgroundsSummary", {
                count: stats.backgrounds.totalCount,
                size: formatBytes(stats.backgrounds.totalBytes),
              })}
            </span>
          </div>
        </section>

        {/* Batch cleanup */}
        <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg flex flex-col gap-3">
          <h3 className="font-bold text-text flex items-center gap-2 text-sm">
            <Trash2 className="w-4 h-4 text-danger" />
            {t("imageCacheBatchTitle")}
          </h3>
          <p className="text-xs text-text-muted">{t("imageCacheBatchDesc")}</p>
          <div className="grid grid-cols-3 gap-2.5">
            <CleanupButton
              label={t("imageCache7d")}
              size={formatBytes(stats.bytes7d)}
              disabled={busy !== null || stats.bytes7d === 0}
              loading={busy === "all:7d"}
              onClick={() => cleanup("all", "7d", "all:7d")}
            />
            <CleanupButton
              label={t("imageCache30d")}
              size={formatBytes(stats.bytes30d)}
              disabled={busy !== null || stats.bytes30d === 0}
              loading={busy === "all:30d"}
              onClick={() => cleanup("all", "30d", "all:30d")}
            />
            <CleanupButton
              label={t("imageCacheAll")}
              size={formatBytes(stats.totalBytes)}
              danger
              disabled={busy !== null || stats.totalBytes === 0}
              loading={busy === "all:all"}
              onClick={() => cleanup("all", "all", "all:all")}
            />
          </div>

          {/* Explicit opt-in for room backgrounds — default OFF. Applies to
              every cleanup action (batch + per-room) while checked. */}
          <label className="flex items-start gap-2.5 mt-1 px-3 py-2.5 rounded-theme border border-border bg-bg/30 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeBackgrounds}
              onChange={(e) => setIncludeBackgrounds(e.target.checked)}
              className="mt-0.5 accent-danger cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text">
                {t("imageCacheIncludeBackgrounds", {
                  size: formatBytes(stats.backgrounds.totalBytes),
                })}
              </span>
              <span className={`flex items-center gap-1 text-[11px] mt-0.5 ${includeBackgrounds ? "text-danger" : "text-text-dim"}`}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {t("imageCacheIncludeBackgroundsWarning")}
              </span>
            </span>
          </label>
        </section>
      </div>

      {/* Per-room table */}
      <section className="bg-surface theme-border border border-border rounded-theme shadow-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_1fr_auto_auto] items-center gap-4 px-5 py-3 border-b border-border text-[10px] text-text-dim uppercase tracking-widest">
          <span>{t("imageCacheColRoom")}</span>
          <span className="text-right w-16">{t("imageCacheColCount")}</span>
          <span className="text-right w-20">{t("imageCacheColSize")}</span>
          <span className="hidden sm:block" />
          <span className="text-right hidden sm:block w-20">{t("imageCacheColEarliest")}</span>
          <span className="text-right w-20">{t("imageCacheColAction")}</span>
        </div>

        {stats.rooms.length === 0 ? (
          <div className="py-12 text-center text-text-dim text-sm">{t("imageCacheEmpty")}</div>
        ) : (
          stats.rooms.map((room, i) => (
            <RoomRow
              key={room.roomId}
              room={room}
              tint={BAR_TINTS[i % BAR_TINTS.length]}
              maxBytes={maxBytes}
              expanded={expanded === room.roomId}
              busy={busy}
              onToggle={() => setExpanded((cur) => (cur === room.roomId ? null : room.roomId))}
              onCleanup={(range, key) => cleanup(room.roomId, range, key)}
              t={t}
            />
          ))
        )}
      </section>
    </div>
  );
}

function CleanupButton({
  label,
  size,
  onClick,
  disabled,
  loading,
  danger,
}: {
  label: string;
  size: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-3 rounded-theme border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "border-danger/50 bg-danger/5 text-danger hover:bg-danger/10"
          : "border-border bg-bg/30 text-text hover:bg-surface-alt hover:border-border"
      }`}
    >
      <span className="text-sm font-semibold flex items-center gap-1.5">
        {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
        {label}
      </span>
      <span className={`text-[11px] font-mono ${danger ? "text-danger/80" : "text-text-dim"}`}>{size}</span>
    </button>
  );
}

function RoomRow({
  room,
  tint,
  maxBytes,
  expanded,
  busy,
  onToggle,
  onCleanup,
  t,
}: {
  room: RoomImageUsageView;
  tint: string;
  maxBytes: number;
  expanded: boolean;
  busy: string | null;
  onToggle: () => void;
  onCleanup: (range: CleanupRange, key: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const earliest = room.earliestMs
    ? new Date(room.earliestMs).toISOString().slice(5, 10) // MM-DD
    : "—";

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <div className="grid grid-cols-[1fr_auto_auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-text truncate">
            {room.name ?? t("imageCacheRoomFallback", { id: room.roomId })}
          </span>
          <span className="text-xs text-text-dim font-mono ml-2">#{room.roomId}</span>
        </div>
        <span className="text-sm font-mono text-text-muted text-right w-16">{room.count}</span>
        <span className="text-sm font-mono text-primary text-right w-20">{formatBytes(room.bytes)}</span>
        <div className="hidden sm:block bg-border/30 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${tint}`}
            style={{ width: `${Math.max(4, (room.bytes / maxBytes) * 100)}%` }}
          />
        </div>
        <span className="text-xs font-mono text-text-dim text-right hidden sm:block w-20">{earliest}</span>
        <button
          onClick={onToggle}
          className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-theme border text-xs font-medium transition cursor-pointer w-20 ${
            expanded
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-danger/40 text-danger hover:bg-danger/10"
          }`}
        >
          {t("imageCacheClean")}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="flex items-center flex-wrap gap-2.5 px-5 pb-4 -mt-1">
          <span className="text-xs text-text-muted mr-1">{t("imageCacheCleanThisRoom")}</span>
          <RangeChip
            label={t("imageCache7d")}
            size={formatBytes(room.bytes7d)}
            disabled={busy !== null || room.bytes7d === 0}
            loading={busy === `${room.roomId}:7d`}
            onClick={() => onCleanup("7d", `${room.roomId}:7d`)}
          />
          <RangeChip
            label={t("imageCache30d")}
            size={formatBytes(room.bytes30d)}
            disabled={busy !== null || room.bytes30d === 0}
            loading={busy === `${room.roomId}:30d`}
            onClick={() => onCleanup("30d", `${room.roomId}:30d`)}
          />
          <RangeChip
            label={t("imageCacheAll")}
            size={formatBytes(room.bytes)}
            danger
            disabled={busy !== null || room.bytes === 0}
            loading={busy === `${room.roomId}:all`}
            onClick={() => onCleanup("all", `${room.roomId}:all`)}
          />
        </div>
      )}
    </div>
  );
}

function RangeChip({
  label,
  size,
  onClick,
  disabled,
  loading,
  danger,
}: {
  label: string;
  size: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-theme border text-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "border-danger/50 bg-danger/5 text-danger hover:bg-danger/10"
          : "border-border bg-bg/30 text-text hover:bg-surface-alt"
      }`}
    >
      {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
      <span className="font-medium">{label}</span>
      <span className={`font-mono ${danger ? "text-danger/70" : "text-text-dim"}`}>· {size}</span>
    </button>
  );
}
