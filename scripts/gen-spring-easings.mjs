/**
 * Generates the `linear()` spring easings used by the overlay motion layer in
 * src/app/globals.css (--ease-spring-*).
 *
 *   node scripts/gen-spring-easings.mjs
 *
 * Why not cubic-bezier: a bezier decelerates monotonically, so it cannot
 * express the damped oscillation macOS/iOS use — cover most of the distance
 * quickly, tip slightly past the target, then sink into place. CSS `linear()`
 * can, by carrying sampled points of the actual spring solution.
 *
 * Parameters follow SwiftUI's Animation.spring(response:dampingFraction:):
 *   response        — the spring's natural period in seconds (lower = stiffer)
 *   dampingFraction — 1.0 is critically damped (no overshoot), lower bounces
 *
 * Samples are evenly spaced, which is what `linear()` assumes when no stop
 * percentages are given. That also makes the emitted curve duration-agnostic:
 * playing it faster just reads as a stiffer spring with the same damping.
 */

/** Displacement of a unit-step damped harmonic oscillator, normalised to 0→1. */
function springFn(response, zeta) {
  const wn = (2 * Math.PI) / response;
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    return (t) =>
      1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t));
  }
  return (t) => 1 - Math.exp(-wn * t) * (1 + wn * t);
}

/** Last moment the curve is still further than `eps` from rest — the duration
 *  the animation must run for, or the tail gets cut off mid-bounce. */
function settleTime(f, eps = 0.001, max = 4) {
  let last = 0;
  for (let t = 0; t <= max; t += 1 / 2000) if (Math.abs(f(t) - 1) > eps) last = t;
  return Math.round((last + 0.01) * 1000);
}

function toLinear(f, durMs, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(f((i / n) * (durMs / 1000)));
  // Pin the endpoints so the animation starts and rests exactly on target.
  pts[0] = 0;
  pts[n] = 1;
  const fmt = (v) => v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") || "0";
  return `linear(${pts.map(fmt).join(", ")})`;
}

function report(label, response, zeta, n) {
  const f = springFn(response, zeta);
  const dur = settleTime(f);
  let peak = 0;
  for (let t = 0; t <= dur / 1000; t += 0.001) peak = Math.max(peak, f(t));
  let t90 = 0;
  for (let t = 0; t <= dur / 1000; t += 0.001) {
    if (f(t) >= 0.9) {
      t90 = t;
      break;
    }
  }
  console.log(`\n/* ${label}  spring(${response}, ${zeta}) */`);
  console.log(
    `   duration ${dur}ms | overshoot ${((peak - 1) * 100).toFixed(1)}% | 90% at ${Math.round(t90 * 1000)}ms`,
  );
  console.log(toLinear(f, dur, n));
}

// Keep these in sync with the three --ease-spring-* variables in globals.css.
// Note on overshoot: a spring's overshoot is a fraction of the TRAVEL, not of
// the final value. A modal scaling 0.92 → 1 only travels 0.08, so even 6%
// overshoot lands at scale 1.005. Keep the modal's `from` scale far enough
// from 1 that the bounce has room to be seen at all.
report("smooth — drawer / sidebar (no overshoot)", 0.42, 0.94, 22);
report("settle — centered modal (visible overshoot)", 0.3, 0.66, 26);
report("snappy — dropdown / pop", 0.24, 0.84, 20);
