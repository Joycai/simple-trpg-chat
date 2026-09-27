import { getTranslations } from "next-intl/server";

const pulse = "motion-safe:animate-pulse";

/**
 * Content-area skeleton for the admin pages: a heading, a row of stat cards,
 * one large panel. `className` is the page's own outer container, so the
 * skeleton sits exactly where the page will — most pages share the default;
 * config and usage pass theirs from their own loading.tsx.
 */
export async function AdminSkeleton({ className = "p-4 md:p-8 max-w-6xl mx-auto" }: { className?: string }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <div className={`h-7 w-48 rounded bg-border/70 ${pulse}`} />
          <div className={`h-3.5 w-80 max-w-full rounded bg-border/60 ${pulse}`} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`h-24 bg-surface border border-border rounded-theme p-4 flex flex-col gap-3 ${pulse}`}
              style={{ animationDelay: `${i * 80}ms` }}>
              <div className="h-3 w-16 rounded bg-border/60" />
              <div className="h-6 w-12 rounded bg-border/70" />
            </div>
          ))}
        </div>
        <div className={`h-64 bg-surface border border-border rounded-theme p-4 flex flex-col gap-3 ${pulse}`}>
          {["w-1/4", "w-full", "w-5/6", "w-2/3", "w-1/2"].map((width, i) => (
            <div key={i} className={`h-3 ${width} rounded ${i === 0 ? "bg-border/70" : "bg-border/60"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
