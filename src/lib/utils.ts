/** Format a timestamp string for display */
export function formatTime(createdAt: string | Date, t?: any): string {
  if (createdAt instanceof Date) {
    return formatWithDate(createdAt, t);
  }
  let cleanStr = createdAt.replace(" ", "T");
  const hasTimezone = cleanStr.includes("Z") || /[-+]\d{2}(:?\d{2})?$/.test(cleanStr);
  if (!hasTimezone) {
    cleanStr += "Z";
  }
  const date = new Date(cleanStr);
  if (isNaN(date.getTime())) return t ? t("unknownTime") : "Unknown time";
  return formatWithDate(date, t);
}

function formatWithDate(date: Date, t?: any): string {
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

/** Roll a single die and return the result */
export function rollDie(faces: number): number {
  return Math.floor(Math.random() * faces) + 1;
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
export function formatDiceResult(diceDetail: string | null, t?: any): string {
  if (!diceDetail) return "";
  try {
    const detail = JSON.parse(diceDetail);
    const parts = [`${detail.notation || detail.dice || ""}`];
    if (detail.results && detail.results.length > 1) {
      parts.push(`[${detail.results.join(", ")}]`);
    }
    parts.push(`= ${detail.sum}`);

    // Skill check (.rc) result
    if (detail.check) {
      const { skillName, target, roll, success, grade } = detail.check;
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

    return parts.join(" ");
  } catch {
    return diceDetail;
  }
}
