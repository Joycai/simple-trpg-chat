import { getTranslations } from "next-intl/server";

const pulse = "motion-safe:animate-pulse";
const delay = (i: number, step = 80) => ({ animationDelay: `${i * step}ms` });

/**
 * Room skeleton, shown while the room page renders. It draws the three shells
 * RoomClient lays out — top bar (two rows below md, like RoomTopBar),
 * conversation sidebar (lg and up; below 1024px the real one starts as a
 * collapsed drawer), message area with its input — plus a few
 * placeholders, but no fake messages, so nothing jumps when the room arrives.
 * The sidebar uses useSidebar's default 200px plus the 4px resize handle: the
 * user's dragged width lives in localStorage, out of the server's reach.
 */
export default async function RoomLoading() {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-busy="true" className="flex flex-col h-dvh bg-bg overflow-hidden">
      <span className="sr-only">{t("loading")}</span>

      <header aria-hidden className="bg-header-bg border-b border-header-border shadow-sm px-4 py-2 sm:py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-stretch md:items-center">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`h-6 w-40 rounded bg-border/70 ${pulse}`} />
            <div className={`h-3 w-12 rounded bg-border/60 ${pulse}`} />
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`w-8 h-8 rounded-theme bg-border/70 ${pulse} ${i >= 3 ? "hidden sm:block" : ""}`} style={delay(i)} />
            ))}
          </div>
        </div>
      </header>

      <div aria-hidden className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex flex-col gap-5 w-[200px] shrink-0 bg-surface-alt room-shell-frost border-r border-border p-3">
          <div className="flex flex-col gap-1.5">
            <div className={`h-2.5 w-10 rounded bg-border/60 ${pulse}`} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`h-8 rounded-theme bg-border/70 ${pulse}`} style={delay(i)} />
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <div className={`h-2.5 w-10 rounded bg-border/60 ${pulse}`} />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`flex items-center gap-2 ${pulse}`} style={delay(i)}>
                <div className="w-6 h-6 rounded-full bg-border/70" />
                <div className="h-3 w-20 rounded bg-border/60" />
              </div>
            ))}
          </div>
        </aside>
        <div className="hidden lg:block w-1 shrink-0 bg-border" />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col justify-end gap-5 px-4 py-4 overflow-hidden">
            {["w-2/3", "w-1/2", "w-3/4"].map((width, i) => (
              <div key={i} className={`flex gap-3 ${pulse}`} style={delay(i, 90)}>
                <div className="w-8 h-8 rounded-theme bg-border/70 shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col gap-2 pt-1">
                  <div className="h-3 w-16 rounded bg-border/60" />
                  <div className={`h-3.5 ${width} rounded bg-border/70`} />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-surface-alt room-shell-frost border-t border-border px-4 py-3 flex items-center gap-2 shrink-0">
            <div className={`w-9 h-9 rounded-theme bg-border/70 shrink-0 ${pulse}`} />
            <div className="flex-1 h-10 rounded-theme bg-input-bg border border-input-border" />
            <div className={`w-16 h-10 rounded-theme bg-border/70 shrink-0 ${pulse}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
