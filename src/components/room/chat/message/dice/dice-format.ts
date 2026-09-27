/** d100 single-die check results pad to two digits per the design (`03` not `3`).
 *  Negative totals (possible with subtractive modifiers, e.g. 狩魂者's -yd6
 *  style dice or a d20 penalty) render as-is — `-4`, never `0-4`. */
export function padD100(value: number | undefined): string {
  if (value == null) return "";
  return value >= 0 && value < 10 ? `0${value}` : String(value);
}

/** Strip the leading "1" off "1d100" → "d100" for visual cleanliness in checks. */
export function trimSingleDieNotation(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("1d") ? raw.slice(1) : raw;
}
