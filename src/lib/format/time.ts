/** Format a timestamp string for display */
export function formatTime(createdAt: string | Date, t?: (key: string, opts?: Record<string, string | number | Date>) => string): string {
  if (createdAt instanceof Date) {
    return formatWithDate(createdAt, t);
  }

  const str = typeof createdAt === "string" ? createdAt.trim() : String(createdAt).trim();
  let cleanStr = str.replace(/\s+/, "T").replace(/\s+/g, "");
  // Truncate microsecond digits to 3 digits (millisecond precision)
  cleanStr = cleanStr.replace(/\.(\d{1,3})\d+/, ".$1");
  // Expand 2-digit offsets (e.g. +08 or -05) to +08:00 or -05:00
  if (/[-+]\d{2}$/.test(cleanStr)) {
    cleanStr += ":00";
  }

  const hasTimezone = cleanStr.includes("Z") || /[-+]\d{2}(:?\d{2})?$/.test(cleanStr);
  if (!hasTimezone) {
    cleanStr += "Z";
  }

  let date = new Date(cleanStr);

  // Custom regex parsing fallback in case new Date() fails on standard formats
  if (isNaN(date.getTime())) {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, y, m, d, hh, mm, ss] = match;
      const offsetMatch = str.match(/([-+])(\d{2}):?(\d{2})?$/);
      if (offsetMatch) {
        const [, sign, oh, om = "00"] = offsetMatch;
        const offsetMinutes = parseInt(oh) * 60 + parseInt(om);
        const diff = sign === "+" ? -offsetMinutes : offsetMinutes;
        const utcDate = new Date(Date.UTC(
          parseInt(y),
          parseInt(m) - 1,
          parseInt(d),
          parseInt(hh),
          parseInt(mm),
          parseInt(ss)
        ));
        date = new Date(utcDate.getTime() + diff * 60 * 1000);
      } else {
        date = new Date(
          parseInt(y),
          parseInt(m) - 1,
          parseInt(d),
          parseInt(hh),
          parseInt(mm),
          parseInt(ss)
        );
      }
    }
  }

  if (isNaN(date.getTime())) return t ? t("unknownTime") : "Unknown time";
  return formatWithDate(date, t);
}

function formatWithDate(date: Date, t?: (key: string, opts?: Record<string, string | number | Date>) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return t ? t("justNow") : "Just now";
  if (diffMin < 60) return t ? t("minutesAgo", { count: diffMin }) : `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t ? t("hoursAgo", { count: diffHour }) : `${diffHour}h ago`;
  return date.toLocaleDateString(t ? t("localeCode") : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


// Fixed-format stamps for compact UI labels. Unlike formatTime they read the
// ISO string as-is (no timezone normalization) and render in the viewer's
// local time; an unparseable input yields "".

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Distribution timestamp → "14:20". Local time, no date: the backpack lists a
 *  single session's handouts, so the clock is the useful part. */
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "10-14" — note-list date stamp. */
export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "10-14 22:07" — viewer header timestamp. */
export function formatMonthDayTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
