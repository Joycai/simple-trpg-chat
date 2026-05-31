/** Format a timestamp string for display */
export function formatTime(createdAt: string): string {
  const date = new Date(createdAt + "Z"); // SQLite stores UTC without TZ
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  return date.toLocaleDateString("zh-CN", {
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
export function formatDiceResult(diceDetail: string | null): string {
  if (!diceDetail) return "";
  try {
    const detail = JSON.parse(diceDetail);
    const parts = [`${detail.notation || detail.dice || ""}`];
    if (detail.results && detail.results.length > 1) {
      parts.push(`[${detail.results.join(", ")}]`);
    }
    parts.push(`= ${detail.sum}`);
    return parts.join(" ");
  } catch {
    return diceDetail;
  }
}
