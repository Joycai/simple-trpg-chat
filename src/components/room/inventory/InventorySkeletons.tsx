import { createPortal } from "react-dom";

/* Renders children at document.body so nested fixed-position modals are sized
   to the viewport, not the drawer panel. The drawer uses transform/will-change
   for its slide animation, which would otherwise become the containing block
   for `position: fixed` and trap the modals inside the sidebar's width. */
export function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/* Loading placeholders — content-shaped grey skeletons shown while the panel
   fetches data, so opening it never flashes a blank/empty drawer. The shapes
   mirror the real layouts to avoid a jump when content swaps in. */
export function BackpackSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-14 rounded-full bg-border/70 animate-pulse" />
        ))}
      </div>
      {/* Item grid */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-theme bg-surface-alt border border-border/60 flex flex-col items-center justify-center gap-2 p-2 animate-pulse"
            style={{ animationDelay: `${(i % 4) * 80}ms` }}>
            <div className="w-7 h-7 rounded-full bg-border/70" />
            <div className="h-2 w-9 rounded bg-border/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ManageSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {/* Create button */}
      <div className="h-11 w-full rounded-theme bg-border/70 animate-pulse" />
      {/* Filters card */}
      <div className="rounded-theme border border-border/40 bg-surface-alt/50 p-3 flex flex-col gap-2.5">
        {[5, 3].map((count, row) => (
          <div key={row} className="flex gap-1.5 items-center">
            <div className="h-3 w-10 rounded bg-border/60 animate-pulse shrink-0" />
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="h-6 w-12 rounded-full bg-border/60 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* List rows */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface-alt rounded-theme p-3 border border-border flex justify-between items-center gap-3 animate-pulse"
            style={{ animationDelay: `${i * 90}ms` }}>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded bg-border/70" />
              <div className="h-2.5 w-1/2 rounded bg-border/60" />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className="h-7 w-11 rounded bg-border/70" />
              <div className="h-7 w-11 rounded bg-border/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
