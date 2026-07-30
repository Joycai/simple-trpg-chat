/**
 * Parchment login-card hero — 书房昼夜 · Open Manuscript by Day, Oil Lamp by Night.
 *
 * Three parts:
 *
 * 1. The Dragon-Sword emblem (in-flow badge): a heraldic dragon coiled around
 *    an upright sword — the adventurer's seal. The default Dice5 emblem is
 *    hidden by [data-theme="parchment"] .default-login-icon { display:none }
 *    in theme.css.
 *
 * 2. Day spread (light mode): 摊开的手稿 — an open two-page manuscript on the
 *    desk: faded iron-gall script, a red rubric drop-cap, a little treasure-map
 *    sketch, and a quill lying across the right page (gently swaying), its nib
 *    trailing a line of ink.
 *
 * 3. Night spread (dark mode): 油灯与深色墨水 — the same manuscript after
 *    dark: a brass oil lamp throws a flickering pool of light over the pages,
 *    the script turns to deep fresh ink with a blot, and the quill now stands
 *    in an inkwell of black ink whose surface glints in the lamplight.
 *
 * Both scene layers are always rendered; the day/night swap, positioning and
 * every animation (flame flicker, glow pulse, ink glint, quill sway, dust
 * motes) live in src/themes/parchment/theme.css — the same mechanism as
 * shrine / rainglass / aether / cthulhu.
 */

/** Faded script lines for a page: staggered widths, etching-style. */
function ScriptLines({ x, y, width, rows, color, opacity }: {
  x: number; y: number; width: number; rows: number; color: string; opacity: number;
}) {
  const widths = [0.94, 0.86, 0.98, 0.78, 0.9, 0.7, 0.96, 0.82];
  return (
    <g stroke={color} strokeOpacity={opacity} strokeWidth="1.2" strokeLinecap="round">
      {Array.from({ length: rows }, (_, i) => (
        <path key={i} d={`M ${x} ${y + i * 8} H ${x + width * widths[i % widths.length]}`} />
      ))}
    </g>
  );
}

export function ParchmentLoginHero() {
  return (
    <div className="parchment-login-hero" aria-hidden="true">
      <span className="parchment-hero-rule parchment-hero-rule-left" />
      <span className="parchment-hero-badge">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="34"
          height="34"
        >
          {/* === Sword (vertical) === */}
          {/* Pommel knob */}
          <circle cx="12" cy="3.2" r="1.1" fill="currentColor" stroke="none" />
          {/* Grip */}
          <path d="M 12 4.4 L 12 5.4" strokeWidth="1.7" />
          {/* Cross-guard */}
          <path d="M 8.4 6 L 15.6 6" strokeWidth="1.8" />
          {/* Upper blade — stops where dragon body crosses in front */}
          <path d="M 12 6.3 L 12 9.6" />
          {/* Lower blade — continues from below the body crossing to the tip */}
          <path d="M 12 13.6 L 12 18" />
          {/* Blade tip */}
          <path d="M 10.5 17.6 L 12 19.6 L 13.5 17.6 Z" fill="currentColor" stroke="none" />

          {/* === Dragon body — bolder S-curve weaving around the blade === */}
          <path d="M 4.5 18
                   Q 8 16.2 12 16
                   Q 16 15.8 18.4 13.6
                   Q 20.6 11 17.8 9
                   Q 14.4 7.6 12 10
                   Q 9.6 12.4 5.5 10.6"
                strokeWidth="1.7" />

          {/* === Dragon head — chunky angular silhouette at upper right === */}
          <path d="M 17.8 9
                   L 21.4 6.6
                   L 22.2 8.2
                   L 21.2 9.2
                   L 22.5 9.9
                   L 20.6 10.8 Z"
                fill="currentColor"
                strokeWidth="0.8" />
          {/* Twin horns sweeping back-up, prominent */}
          <path d="M 21.4 6.6 L 23 4.4" strokeWidth="1.4" />
          <path d="M 22.2 8.2 L 23.8 6.6" strokeWidth="1.4" />
          {/* Eye — negative dot inside filled head */}
          <circle cx="20.6" cy="9.1" r="0.55" fill="rgb(var(--theme-bg))" stroke="none" />

          {/* === Wing — two bat-fan spokes rising from upper coil === */}
          <path d="M 9 11.6 L 7 6.5 L 9 9.5" strokeWidth="1.2" />
          <path d="M 10.6 11.4 L 10.7 6.2 L 11.4 9.4" strokeWidth="1.2" />

          {/* === Tail — three lashes at lower left === */}
          <path d="M 4.5 18 L 2 18.6" strokeWidth="1.2" />
          <path d="M 4.5 18 L 1.7 19.8" strokeWidth="1.2" />
          <path d="M 4.5 18 L 3 20.6" strokeWidth="1.2" />
        </svg>
        <span className="parchment-hero-badge-ring" />
      </span>
      <span className="parchment-hero-rule parchment-hero-rule-right" />

      {/* ── Day: the open manuscript with a quill lying across it ── */}
      <svg
        className="prch-hero-desk prch-hero-day"
        viewBox="0 0 448 112"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="prchDayFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1e3b9" stopOpacity="0" />
            <stop offset="1" stopColor="#f1e3b9" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* desk shadow under the spread */}
        <ellipse cx="224" cy="96" rx="160" ry="10" fill="#503214" fillOpacity="0.14" />
        {/* left page (slight outward tilt, curled outer corner) */}
        <path d="M 88 18 L 222 14 L 222 96 L 96 100 Q 84 92 90 78 Z" fill="#f6ebc6" stroke="#b48c64" strokeWidth="1" />
        <path d="M 96 100 Q 90 90 98 84" fill="none" stroke="#b48c64" strokeWidth="0.8" strokeOpacity="0.7" />
        {/* right page */}
        <path d="M 226 14 L 360 18 L 358 78 Q 364 92 352 100 L 226 96 Z" fill="#f6ebc6" stroke="#b48c64" strokeWidth="1" />
        {/* center gutter shadow */}
        <path d="M 224 14 V 98" stroke="#8a6a44" strokeWidth="2" strokeOpacity="0.35" />
        <path d="M 224 14 V 98" stroke="#503214" strokeWidth="6" strokeOpacity="0.08" />
        {/* left page: red rubric drop-cap + faded script */}
        <rect x="100" y="26" width="11" height="11" fill="#9a2818" fillOpacity="0.85" />
        <path d="M 103 29 H 108 M 103 32 H 106" stroke="#f6ebc6" strokeWidth="0.9" />
        <path d="M 116 30 H 208" stroke="#6f5132" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
        <ScriptLines x={100} y={44} width={110} rows={6} color="#6f5132" opacity={0.5} />
        {/* right page: script + a little treasure-map sketch */}
        <ScriptLines x={238} y={28} width={106} rows={3} color="#6f5132" opacity={0.5} />
        <path d="M 262 62 L 268 54 L 274 62 M 276 60 L 281 53 L 286 60" stroke="#6f5132" strokeWidth="1" fill="none" strokeOpacity="0.6" />
        <path d="M 244 78 Q 268 66 292 74 Q 318 82 336 70" stroke="#6f5132" strokeWidth="1" strokeDasharray="3 3" fill="none" strokeOpacity="0.6" />
        <path d="M 336 66 L 344 74 M 344 66 L 336 74" stroke="#9a2818" strokeWidth="1.6" strokeLinecap="round" />
        {/* the quill lying across the right page (sways in theme.css) */}
        <g className="prch-quill">
          {/* fresh ink trailing from the nib */}
          <path d="M 240 88 Q 254 84 266 86" stroke="#17100a" strokeWidth="1.3" strokeOpacity="0.7" fill="none" strokeLinecap="round" />
          {/* shaft */}
          <path d="M 266 86 Q 300 72 342 40" stroke="#8a6a44" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* nib */}
          <path d="M 258 89 L 266 86 L 262 81 Z" fill="#3a2614" />
          <path d="M 262 86.5 L 258 89" stroke="#f6ebc6" strokeWidth="0.5" />
          {/* feather body + barbs */}
          <path d="M 296 74 Q 318 74 342 40 Q 350 52 336 66 Q 320 82 296 74 Z" fill="#efe6cd" stroke="#b48c64" strokeWidth="0.9" />
          <path d="M 306 74 L 314 64 M 316 70 L 324 58 M 326 64 L 334 50 M 334 58 L 341 46" stroke="#b48c64" strokeWidth="0.6" strokeOpacity="0.8" />
        </g>
        {/* fade into the card surface */}
        <rect x="0" y="90" width="448" height="22" fill="url(#prchDayFade)" />
      </svg>

      {/* ── Night: the oil lamp, the inkwell of dark ink, the standing quill ── */}
      <svg
        className="prch-hero-desk prch-hero-night"
        viewBox="0 0 448 130"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="prchNightFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#251a0f" stopOpacity="0" />
            <stop offset="1" stopColor="#251a0f" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="prchLampPool" cx="0.72" cy="0.4" r="0.75">
            <stop offset="0" stopColor="#ffd88a" stopOpacity="0.22" />
            <stop offset="0.55" stopColor="#ffb85a" stopOpacity="0.08" />
            <stop offset="1" stopColor="#ffb85a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* lamplight pool washing the whole scene (pulses in theme.css) */}
        <rect className="prch-glow" x="0" y="0" width="448" height="130" fill="url(#prchLampPool)" />
        {/* desk shadow */}
        <ellipse cx="210" cy="102" rx="150" ry="10" fill="#000000" fillOpacity="0.35" />
        {/* the same spread, candlelit vellum */}
        <path d="M 74 24 L 208 20 L 208 102 L 82 106 Q 70 98 76 84 Z" fill="#4a361e" stroke="#8a6a44" strokeWidth="1" />
        <path d="M 212 20 L 346 24 L 344 84 Q 350 98 338 106 L 212 102 Z" fill="#503a20" stroke="#8a6a44" strokeWidth="1" />
        <path d="M 210 20 V 104" stroke="#17100a" strokeWidth="2" strokeOpacity="0.5" />
        {/* deep fresh ink: darker script + a blot where the writing stopped */}
        <rect x="86" y="32" width="11" height="11" fill="#7a2416" />
        <path d="M 102 36 H 194" stroke="#150e08" strokeOpacity="0.85" strokeWidth="1.3" strokeLinecap="round" />
        <ScriptLines x={86} y={50} width={108} rows={6} color="#150e08" opacity={0.8} />
        <ScriptLines x={224} y={34} width={104} rows={4} color="#150e08" opacity={0.8} />
        {/* the last, half-written line + ink blot */}
        <path d="M 224 70 H 272" stroke="#150e08" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M 278 72 Q 282 66 287 71 Q 293 69 292 75 Q 296 79 289 79 Q 283 82 281 77 Q 275 76 278 72 Z" fill="#0d0805" />
        <circle cx="296" cy="74" r="1.2" fill="#0d0805" />
        {/* inkwell of dark ink, left of the spread */}
        <path d="M 116 88 L 122 62 L 150 62 L 156 88 Q 136 96 116 88 Z" fill="#241a10" stroke="#8a6a44" strokeWidth="1" />
        <ellipse cx="136" cy="62" rx="14" ry="4.5" fill="#0d0805" stroke="#8a6a44" strokeWidth="0.9" />
        {/* lamplight glinting off the ink surface */}
        <path className="prch-ink-glint" d="M 128 61.5 A 9 2.6 0 0 1 143 61" stroke="#caa15a" strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* the quill now stands in the ink */}
        <path d="M 138 60 Q 152 34 176 10" stroke="#8a6a44" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 152 38 Q 166 34 176 10 Q 184 20 174 32 Q 164 44 152 38 Z" fill="#d8c9a4" fillOpacity="0.9" stroke="#8a6a44" strokeWidth="0.9" />
        <path d="M 158 36 L 166 26 M 164 32 L 172 20" stroke="#8a6a44" strokeWidth="0.6" strokeOpacity="0.8" />
        {/* the brass oil lamp, right — base, font, chimney, flame */}
        <ellipse cx="376" cy="106" rx="30" ry="5" fill="#17100a" />
        <path d="M 352 104 Q 356 96 366 94 L 386 94 Q 396 96 400 104 Z" fill="#8a6a3a" stroke="#caa15a" strokeWidth="0.9" />
        <path d="M 360 94 Q 358 80 368 76 L 384 76 Q 394 80 392 94 Z" fill="#8a6a3a" stroke="#caa15a" strokeWidth="0.9" />
        <path d="M 362 84 Q 376 80 390 84" stroke="#ffe9b8" strokeWidth="0.8" strokeOpacity="0.5" fill="none" />
        {/* wick knob */}
        <circle cx="394" cy="82" r="3" fill="#8a6a3a" stroke="#caa15a" strokeWidth="0.8" />
        <path d="M 392 82 H 396" stroke="#3a2614" strokeWidth="0.8" />
        {/* glass chimney */}
        <path d="M 364 76 Q 360 58 368 44 Q 372 34 376 32 Q 380 34 384 44 Q 392 58 388 76 Z"
          fill="#ffd88a" fillOpacity="0.08" stroke="#caa15a" strokeWidth="1" strokeOpacity="0.6" />
        {/* flame (flickers in theme.css) */}
        <g className="prch-flame">
          <path d="M 376 72 Q 370 62 376 52 Q 382 62 376 72 Z" fill="#ff9c3a" fillOpacity="0.85" />
          <path d="M 376 69 Q 373 63 376 57 Q 379 63 376 69 Z" fill="#ffe9b8" />
        </g>
        <g className="prch-glow">
          <circle cx="376" cy="60" r="20" fill="#ffb85a" fillOpacity="0.14" />
          <circle cx="376" cy="60" r="34" fill="#ffb85a" fillOpacity="0.07" />
        </g>
        {/* dust motes drifting in the lamplight */}
        <circle className="prch-mote" cx="332" cy="46" r="1.1" fill="#ffe9b8" fillOpacity="0.55" />
        <circle className="prch-mote prch-mote-b" cx="350" cy="30" r="0.9" fill="#ffe9b8" fillOpacity="0.45" />
        <circle className="prch-mote" cx="312" cy="62" r="0.8" fill="#ffe9b8" fillOpacity="0.4" />
        {/* fade into the card surface */}
        <rect x="0" y="106" width="448" height="24" fill="url(#prchNightFade)" />
      </svg>
    </div>
  );
}
