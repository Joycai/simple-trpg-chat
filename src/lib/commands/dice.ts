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
