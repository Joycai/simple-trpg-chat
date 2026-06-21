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

/**
 * Roll a single fair die in [1, faces].
 *
 * Uses a CSPRNG (`crypto.getRandomValues`) instead of `Math.random()`. Two reasons:
 * - **Integrity**: `Math.random()` (V8 xorshift128+) is statistically uniform but
 *   *predictable* — its state can be recovered from a stream of observed outputs,
 *   which would let a player predict hidden rolls (`.rh`), sanity checks, and the
 *   GM's dice. A CSPRNG is not reversible from its output.
 * - **No modulo bias**: rejection sampling discards the unevenly-mapped tail of the
 *   uint32 range, so every face is exactly equiprobable.
 *
 * `globalThis.crypto` is available in both the Node server runtime (≥20) and the
 * browser, so this stays isomorphic for any caller.
 */
export function rollDie(faces: number): number {
  if (faces <= 1) return 1;
  // Largest multiple of `faces` that fits in a uint32; reject anything at or above
  // it so the remaining range divides evenly by `faces` (no modulo bias).
  const limit = Math.floor(0x1_0000_0000 / faces) * faces;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return (x % faces) + 1;
}

/** Roll multiple dice and return details */
export function rollDice(faces: number, count: number): {
  results: number[];
  sum: number;
  notation: string;
} {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(faces));
  }
  const sum = results.reduce((a, b) => a + b, 0);
  return { results, sum, notation: `${count}d${faces}` };
}

/** Format dice roll for display */
export function formatDiceResult(diceDetail: string | null, t?: (key: string, opts?: Record<string, string | number | Date>) => string): string {
  if (!diceDetail) return "";
  try {
    const detail = JSON.parse(diceDetail);

    // Echo the original command so observers see what was rolled (spec: 反馈含原始指令).
    const echo = typeof detail.command === "string" && detail.command.trim()
      ? `「${detail.command.trim()}」 `
      : "";

    // Sanity check (.sc) result
    if (detail.sanityCheck) {
      const { oldSanity, newSanity, deductExpression, deduction, isSuccess } = detail.sanityCheck;
      const checkResultLabel = isSuccess
        ? (t ? t("scSuccess") || "成功" : "Success")
        : (t ? t("scFailure") || "失败" : "Failure");

      const deductLabel = t ? t("scDeductLabel") || "扣除" : "Deduct";
      const sanityLabel = t ? t("scSanityLabel") || "理智" : "Sanity";
      const warningLabel = deduction >= 5
        ? ` [⚠️ ${t ? t("scWarningInsanityShort") || "临时疯狂" : "Temporary Insanity"}]`
        : "";

      const scParts = [
        `d100 = ${detail.sum}`,
        `← ${t ? t("scSanityLabel") || "理智" : "理智"}值(${oldSanity}) ${checkResultLabel}`,
        `| ${deductLabel}: ${deductExpression} = ${deduction}`,
        `| ${sanityLabel}: ${oldSanity} → ${newSanity}${warningLabel}`
      ];
      return echo + scParts.join(" ");
    }

    const parts = [`${detail.notation || detail.dice || ""}`];
    if (detail.results && detail.results.length > 1) {
      parts.push(`[${detail.results.join(", ")}]`);
    }
    parts.push(`= ${detail.sum}`);

    // Skill check (.rc) result
    if (detail.check) {
      const { skillName, target, success, grade } = detail.check;
      let label: string;
      if (t) {
        if (grade === "critical") label = `🟢 ${t("critical")}`;
        else if (grade === "fumble") label = `🔴 ${t("fumble")}`;
        else label = success ? `✅ ${t("success")}` : `❌ ${t("failure")}`;
      } else {
        if (grade === "critical") label = "🟢 Critical Success!";
        else if (grade === "fumble") label = "🔴 Fumble!";
        else label = success ? "✅ Success" : "❌ Failure";
      }
      parts.push(`← ${skillName}(${target}) ${label}`);
    }

    return echo + parts.join(" ");
  } catch {
    return diceDetail;
  }
}
