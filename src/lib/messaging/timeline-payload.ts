/**
 * Structured payload carried in `messages.diceDetail` when `systemKind` is
 * `timeline-divider` — the host's "插入时间线分割" (insert timeline divider)
 * marker used to separate in-game dates in the chat feed.
 *
 * The chat UI recomposes a localized label from this payload (so the same row
 * reads correctly in zh / en); the plain `content` still stores a fallback
 * label for themes without special rendering, export, and accessibility.
 */

export type TimelineMode = "day" | "date" | "custom";
export type TimelineTimeMode = "segment" | "clock";
export type TimelineSegment = "morning" | "afternoon" | "night";

export interface TimelineDividerData {
  /** Ordinal day ("第N日"), a calendar date, or free-text ("custom"). */
  mode: TimelineMode;
  /** Ordinal day number (mode === "day"). */
  day?: number | null;
  /** ISO calendar date `yyyy-mm-dd` (mode === "date"). */
  date?: string | null;
  /** Free-text label typed by the host (mode === "custom"); used verbatim. */
  custom?: string | null;
  /** Whether the tail reads as a day segment (上午/下午/夜晚) or an HH:MM clock.
   *  Unused for `custom`, whose label is the free text alone. */
  timeMode: TimelineTimeMode;
  segment?: TimelineSegment | null;
  /** `HH:MM` (timeMode === "clock"). */
  clock?: string | null;
}

export interface TimelinePayload {
  timelineDivider: TimelineDividerData;
}

export function buildTimelinePayload(data: TimelineDividerData): string {
  return JSON.stringify({ timelineDivider: data } satisfies TimelinePayload);
}

/**
 * Read a stored payload. Deliberately lenient: it also serves historical
 * `timeline-divider` messages, and tightening it would silently downgrade rows
 * written before any given rule existed. Trust comes from the write path —
 * see `sanitizeTimelineDivider`, which every writer must run first.
 */
export function parseTimelinePayload(raw: string | null | undefined): TimelineDividerData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TimelinePayload>;
    const d = parsed?.timelineDivider;
    // Guard the shape only: consumers destructure fields off this.
    return d && typeof d === "object" && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Validate and normalize host-supplied divider data; null when unusable.
 *
 * This is the single gate on the write path. The rules are exactly those the
 * timeline-divider action has enforced since it shipped — extracted here so
 * the event module can reuse them instead of re-deriving (its own
 * `cleanTimePayload` was a JSON round-trip that validated nothing, which let a
 * crafted `custom: {}` reach `composeTimelineLabel`'s `.trim()` and blank the
 * whole events panel).
 */
export function sanitizeTimelineDivider(data: unknown): TimelineDividerData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Partial<TimelineDividerData>;

  const mode = d.mode;
  if (mode !== "day" && mode !== "date" && mode !== "custom") return null;
  const timeMode = d.timeMode;
  if (timeMode !== "segment" && timeMode !== "clock") return null;

  const clean: TimelineDividerData = { mode, timeMode };

  if (mode === "day") {
    const day = Math.trunc(Number(d.day));
    if (!Number.isFinite(day) || day < 1 || day > 999) return null;
    clean.day = day;
  } else if (mode === "date") {
    const date = String(d.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) return null;
    clean.date = date;
  } else {
    const custom = typeof d.custom === "string" ? d.custom.trim() : "";
    if (!custom) return null;
    clean.custom = custom.slice(0, 100);
  }

  if (timeMode === "segment") {
    const seg = d.segment;
    if (seg !== "morning" && seg !== "afternoon" && seg !== "night") return null;
    clean.segment = seg;
  } else {
    const clock = String(d.clock ?? "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
    clean.clock = clock;
  }

  return clean;
}

/**
 * The light/dark mode a divider implies for the room's "follow timeline" setting:
 * 夜晚 (or a clock hour in 18:00–05:59) → dark; 上午/下午 (or a daytime hour) → light.
 * Returns null when the payload carries no usable time.
 */
export function resolvedModeFromDivider(data: TimelineDividerData | null): "light" | "dark" | null {
  if (!data) return null;
  if (data.timeMode === "segment") {
    if (data.segment === "night") return "dark";
    if (data.segment === "morning" || data.segment === "afternoon") return "light";
    return null;
  }
  if (data.timeMode === "clock" && data.clock) {
    const hour = parseInt(data.clock.slice(0, 2), 10);
    if (Number.isNaN(hour)) return null;
    return hour >= 18 || hour < 6 ? "dark" : "light";
  }
  return null;
}

/**
 * Coarse day-part for a divider's time, used to tint UI (e.g. the event card's
 * time pill): 上午/06:00–11:59 → morning, 下午/12:00–17:59 → afternoon,
 * 夜晚/18:00–05:59 → night. Returns null when the payload carries no segment or
 * clock (custom text, or a date with no time) — callers then fall back to a
 * neutral tint. Finer-grained than {@link resolvedModeFromDivider}'s light/dark.
 */
export function dayPartFromDivider(data: TimelineDividerData | null): TimelineSegment | null {
  if (!data) return null;
  if (data.timeMode === "segment") return data.segment ?? null;
  if (data.timeMode === "clock" && data.clock) {
    const hour = parseInt(data.clock.slice(0, 2), 10);
    if (Number.isNaN(hour)) return null;
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    return "night";
  }
  return null;
}

const SEGMENT_KEY: Record<TimelineSegment, string> = {
  morning: "segMorning",
  afternoon: "segAfternoon",
  night: "segNight",
};

/**
 * Chinese numeral for a positive integer 1–999 (covers any realistic day count).
 * Falls back to the arabic string outside that range.
 */
export function toCJKNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百"];
  const arr = String(n).split("").map(Number);
  const len = arr.length;
  let s = "";
  for (let i = 0; i < len; i++) {
    const d = arr[i];
    if (d === 0) {
      if (!s.endsWith("零") && i !== len - 1) s += "零";
    } else {
      s += digits[d] + units[len - 1 - i];
    }
  }
  s = s.replace(/零+$/, "").replace(/^一十/, "十");
  return s || String(n);
}

/** Locale-aware long date, e.g. zh → "1925年8月14日", en → "August 14, 1925". */
export function formatTimelineDate(date: string, locale: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const loc = locale.startsWith("zh") ? "zh-CN" : "en-US";
  return new Intl.DateTimeFormat(loc, { year: "numeric", month: "long", day: "numeric" }).format(d);
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Compose the human-readable divider label from its payload. `t` must be bound
 * to the `timeline` message namespace; `locale` selects numeral / date format.
 */
export function composeTimelineLabel(
  data: TimelineDividerData,
  t: Translator,
  locale: string,
): string {
  const isZh = locale.startsWith("zh");
  // Defensive against rows stored before the write path was gated: a non-string
  // `custom` used to throw here and blank the panel that rendered it.
  let head = "";
  if (data.mode === "custom") {
    head = typeof data.custom === "string" ? data.custom.trim() : "";
  } else if (data.mode === "day" && typeof data.day === "number") {
    head = t("labelDay", { day: isZh ? toCJKNumeral(data.day) : String(data.day) });
  } else if (data.mode === "date" && typeof data.date === "string") {
    head = formatTimelineDate(data.date, locale);
  }

  let tail = "";
  if (data.timeMode === "segment" && data.segment && SEGMENT_KEY[data.segment]) {
    tail = t(SEGMENT_KEY[data.segment]);
  } else if (data.timeMode === "clock" && typeof data.clock === "string") {
    tail = data.clock;
  }

  if (head && tail) return `${head} · ${tail}`;
  return head || tail || "";
}
