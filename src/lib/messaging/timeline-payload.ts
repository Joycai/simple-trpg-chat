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

export function parseTimelinePayload(raw: string | null | undefined): TimelineDividerData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TimelinePayload>;
    return parsed?.timelineDivider ?? null;
  } catch {
    return null;
  }
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
  let head = "";
  if (data.mode === "custom") {
    head = (data.custom ?? "").trim();
  } else if (data.mode === "day" && data.day != null) {
    head = t("labelDay", { day: isZh ? toCJKNumeral(data.day) : String(data.day) });
  } else if (data.mode === "date" && data.date) {
    head = formatTimelineDate(data.date, locale);
  }

  let tail = "";
  if (data.timeMode === "segment" && data.segment) {
    tail = t(SEGMENT_KEY[data.segment]);
  } else if (data.timeMode === "clock" && data.clock) {
    tail = data.clock;
  }

  if (head && tail) return `${head} · ${tail}`;
  return head || tail || "";
}
