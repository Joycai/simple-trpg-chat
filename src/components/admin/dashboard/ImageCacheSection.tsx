"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Images, ChevronRight, TrendingUp } from "lucide-react";
import type { ImageCacheStatsView } from "@/app/actions/image-cache";
import { formatBytes, splitBytes } from "@/lib/format-bytes";

/** Bar tint tiers (mirrors the design's warm→cool gradient across rooms). */
const BAR_TINTS = ["bg-primary", "bg-accent", "bg-warning", "bg-success", "bg-ai"];

export function ImageCacheSection({ stats }: { stats: ImageCacheStatsView | null }) {
  const t = useTranslations("admin");

  if (!stats) {
    return (
      <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg">
        <div className="py-8 text-center text-text-dim text-xs animate-pulse">{t("loadingMonitor")}</div>
      </section>
    );
  }

  const { value, unit } = splitBytes(stats.totalBytes);
  const pct = stats.quotaBytes > 0 ? Math.min(100, (stats.totalBytes / stats.quotaBytes) * 100) : 0;
  const topRooms = stats.rooms.slice(0, 3);
  const maxBytes = topRooms[0]?.bytes || 1;

  return (
    <section className="bg-surface p-5 theme-border border border-border rounded-theme shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-text flex items-center gap-2 text-sm">
          <Images className="w-4 h-4 text-primary" />
          {t("imageCache")}
        </h3>
        <Link
          href="/admin/images"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition"
        >
          {t("imageCacheManage")}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Usage summary */}
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold font-theme-display text-primary leading-none">{value}</span>
            <span className="text-sm text-text-muted mb-0.5">{unit}</span>
            <span className="text-xs text-text-dim mb-1">
              / {formatBytes(stats.quotaBytes)} {t("imageCacheQuota")}
            </span>
          </div>
          <div className="w-full bg-border/40 h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-warning transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Images className="w-3.5 h-3.5 text-text-dim" />
              {t("imageCacheCount", { count: stats.totalCount })}
            </span>
            {stats.bytesToday > 0 && (
              <span className="inline-flex items-center gap-1.5 text-success">
                <TrendingUp className="w-3.5 h-3.5" />
                {t("imageCacheToday", { size: formatBytes(stats.bytesToday) })}
              </span>
            )}
          </div>
        </div>

        {/* Top rooms */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] text-text-dim uppercase tracking-widest">{t("imageCacheTopRooms")}</div>
          {topRooms.length === 0 ? (
            <div className="text-xs text-text-dim py-2">{t("imageCacheEmpty")}</div>
          ) : (
            topRooms.map((room, i) => (
              <div key={room.roomId} className="flex items-center gap-3">
                <span className="text-xs text-text-muted font-medium truncate w-24 shrink-0">
                  {room.name ?? t("imageCacheRoomFallback", { id: room.roomId })}
                </span>
                <div className="flex-1 bg-border/30 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${BAR_TINTS[i % BAR_TINTS.length]}`}
                    style={{ width: `${Math.max(4, (room.bytes / maxBytes) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-text-muted w-16 text-right shrink-0">
                  {formatBytes(room.bytes)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
