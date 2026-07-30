/**
 * Cthulhu login-card hero — 雾港昼夜 · Misty Coast by Day, Lighthouse in Fog by Night.
 *
 * Three parts:
 *
 * 1. The Elder Sign emblem (in-flow badge): a brass-rimmed five-pointed star
 *    with the central flame eye — the「因思茅斯港 · 通行登记」seal. The default
 *    Dice5 emblem is hidden by
 *    [data-theme="cthulhu"] .default-login-icon { display:none } in theme.css.
 *
 * 2. Day coast (light mode): 迷雾海岸 — a faded sepia etching of the Innsmouth
 *    shore printed across the card's crown: pale sun behind haze, a distant
 *    headland, Devil Reef's jagged teeth in a muted sea, a lone fishing boat,
 *    gulls, and two banks of drifting fog (slow CSS drift).
 *
 * 3. Night lighthouse (dark mode): 雾中灯塔 — the same shore after dark: a
 *    striped lighthouse on its rocks sweeps a brass beam through the fog
 *    (slow ±sweep + lamp flicker), a gibbous moon hangs behind the haze,
 *    a red harbor light blinks far out, and something phosphorescent
 *    glimmers under the water.
 *
 * Both scene layers are always rendered; the day/night swap, positioning and
 * every animation live in src/themes/cthulhu/theme.css (gated on
 * [data-theme="cthulhu"][data-mode]) — the same mechanism as shrine /
 * rainglass / aether.
 */

export function CthulhuLoginHero() {
  return (
    <div className="cthulhu-login-hero" aria-hidden="true">
      <span className="cthulhu-hero-rule cthulhu-hero-rule-left" />
      <span className="cthulhu-hero-badge">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="32"
          height="32"
        >
          {/* Elder Sign — five-pointed star */}
          <path d="M12 2.5 9.4 9.4 2 9.4 7.9 13.7 5.7 21 12 16.7 18.3 21 16.1 13.7 22 9.4 14.6 9.4z" />
          {/* central flame eye */}
          <path d="M12 11.5 V14.5" strokeWidth="1.9" />
          <circle cx="12" cy="11.5" r="0.9" fill="currentColor" />
        </svg>
        {/* dashed inner ring */}
        <span className="cthulhu-hero-badge-ring" />
      </span>
      <span className="cthulhu-hero-rule cthulhu-hero-rule-right" />

      {/* ── Day: sepia etching of the misty Innsmouth coast ── */}
      <svg
        className="cth-hero-scene cth-hero-coast"
        viewBox="0 0 448 110"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="cthCoastFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2d9c0" stopOpacity="0" />
            <stop offset="1" stopColor="#e2d9c0" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* pale sun burning through the haze */}
        <circle cx="90" cy="26" r="20" fill="#f6efd8" fillOpacity="0.5" />
        <circle cx="90" cy="26" r="12" fill="#f2e8c8" fillOpacity="0.9" />
        {/* distant headland sloping into the sea, right */}
        <path d="M 268 58 C 310 44 348 36 380 32 C 404 29 430 28 448 28 L 448 58 Z" fill="#b3a67e" fillOpacity="0.85" />
        <path d="M 316 58 C 344 48 372 42 400 40 C 418 39 436 39 448 40 L 448 58 Z" fill="#8a7c58" fillOpacity="0.8" />
        {/* sea sheet + horizon */}
        <rect x="0" y="58" width="448" height="40" fill="#b9ab82" fillOpacity="0.38" />
        <path d="M 0 58 H 448" stroke="#6b6248" strokeWidth="0.8" strokeOpacity="0.6" />
        {/* wave etching strokes */}
        <path d="M 18 70 H 64 M 92 78 H 150 M 178 68 H 224 M 250 82 H 306 M 330 72 H 372 M 396 84 H 434 M 40 90 H 96 M 200 94 H 262"
          stroke="#6b6248" strokeWidth="0.7" strokeOpacity="0.45" strokeLinecap="round" />
        {/* Devil Reef — jagged teeth breaking the surface */}
        <path d="M 236 76 L 244 60 L 250 70 L 258 56 L 265 74 L 272 64 L 278 76 Z" fill="#55503c" />
        <path d="M 348 82 L 356 68 L 362 78 L 370 66 L 377 82 Z" fill="#55503c" fillOpacity="0.85" />
        {/* a lone fishing boat on the horizon */}
        <path d="M 178 56 L 196 56 L 192 60 L 181 60 Z" fill="#55503c" />
        <path d="M 187 56 V 45 M 187 46 L 195 52 L 187 52" stroke="#55503c" strokeWidth="1" fill="none" />
        {/* gulls */}
        <path d="M 136 28 Q 139 25 142 28 Q 145 25 148 28 M 158 36 Q 160 34 162 36 Q 164 34 166 36 M 118 40 Q 120 38 122 40 Q 124 38 126 40"
          stroke="#6b6248" strokeWidth="0.9" fill="none" strokeLinecap="round" />
        {/* drifting fog banks (animated in theme.css) */}
        <g className="cth-fog-far">
          <rect x="-30" y="46" width="240" height="14" rx="7" fill="#f6efd8" fillOpacity="0.55" />
          <rect x="230" y="50" width="250" height="12" rx="6" fill="#f6efd8" fillOpacity="0.45" />
        </g>
        <g className="cth-fog-near">
          <rect x="-40" y="76" width="300" height="18" rx="9" fill="#f2ecd8" fillOpacity="0.6" />
          <rect x="270" y="82" width="220" height="16" rx="8" fill="#f2ecd8" fillOpacity="0.5" />
        </g>
        {/* fade into the card surface */}
        <rect x="0" y="86" width="448" height="24" fill="url(#cthCoastFade)" />
      </svg>

      {/* ── Night: the lighthouse sweeping its beam through the fog ── */}
      <svg
        className="cth-hero-scene cth-hero-light"
        viewBox="0 0 448 130"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="cthBeam" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#c4a05a" stopOpacity="0.4" />
            <stop offset="0.55" stopColor="#c4a05a" stopOpacity="0.14" />
            <stop offset="1" stopColor="#c4a05a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cthNightFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#101c20" stopOpacity="0" />
            <stop offset="1" stopColor="#101c20" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* gibbous moon behind the haze */}
        <circle cx="70" cy="24" r="18" fill="#dde2ce" fillOpacity="0.10" />
        <circle cx="70" cy="24" r="11" fill="#dde2ce" fillOpacity="0.30" />
        <path d="M 66 15 A 11 11 0 0 1 78 29" stroke="#eef2de" strokeWidth="1" strokeOpacity="0.5" fill="none" />
        {/* sea + horizon */}
        <rect x="0" y="84" width="448" height="36" fill="#0d1e24" />
        <path d="M 0 84 H 448" stroke="#2c4048" strokeWidth="0.8" strokeOpacity="0.8" />
        {/* far fog wall over the horizon (animated) */}
        <g className="cth-fog-far">
          <rect x="-40" y="62" width="300" height="20" rx="10" fill="#dde2ce" fillOpacity="0.05" />
          <rect x="220" y="68" width="260" height="16" rx="8" fill="#dde2ce" fillOpacity="0.04" />
        </g>
        {/* the beam — apex at the lantern, sweeping (rotates in theme.css) */}
        <polygon className="cth-beam" points="368,26 16,0 16,60" fill="url(#cthBeam)" />
        {/* beam-caught glints on the water */}
        <path d="M 60 96 H 118 M 150 104 H 196 M 230 92 H 268" stroke="#c4a05a" strokeWidth="0.7" strokeOpacity="0.28" strokeLinecap="round" />
        {/* something phosphorescent under the water */}
        <ellipse cx="120" cy="112" rx="44" ry="7" fill="#8a7bb8" fillOpacity="0.10" />
        <ellipse cx="126" cy="112" rx="20" ry="4" fill="#8a7bb8" fillOpacity="0.10" />
        {/* red harbor light far out, blinking */}
        <circle className="cth-harbor-light" cx="30" cy="80" r="2" fill="#9e4536" />
        <path d="M 26 96 H 34" stroke="#9e4536" strokeWidth="0.8" strokeOpacity="0.4" />
        {/* lighthouse rocks */}
        <path d="M 336 124 L 348 104 L 362 110 L 376 100 L 392 108 L 406 102 L 420 112 L 430 124 Z" fill="#0d181c" />
        <path d="M 348 104 L 362 110 L 376 100" stroke="#2c4048" strokeWidth="0.8" fill="none" strokeOpacity="0.7" />
        {/* the tower — tapered, two pallid bands */}
        <path d="M 362 104 L 368 34 L 384 34 L 390 104 Z" fill="#182a30" stroke="#2c4048" strokeWidth="1" />
        <path d="M 366.5 52 L 385.5 52 L 384.6 42 L 367.4 42 Z" fill="#3a4c50" />
        <path d="M 364.5 76 L 387.5 76 L 386.6 66 L 365.4 66 Z" fill="#3a4c50" />
        {/* gallery + railing */}
        <rect x="360" y="30" width="32" height="4" rx="1" fill="#182a30" stroke="#2c4048" strokeWidth="0.8" />
        <path d="M 363 30 V 26 M 369 30 V 26 M 376 30 V 26 M 383 30 V 26 M 389 30 V 26 M 361 26 H 391" stroke="#2c4048" strokeWidth="0.8" />
        {/* lantern room + lamp + dome */}
        <rect x="366" y="16" width="20" height="12" rx="1.5" fill="#101c20" stroke="#c4a05a" strokeOpacity="0.5" strokeWidth="0.8" />
        <g className="cth-lamp">
          <circle cx="376" cy="22" r="7" fill="#ffd88a" fillOpacity="0.30" />
          <rect x="370" y="18" width="12" height="8" rx="1" fill="#ffd88a" fillOpacity="0.85" />
        </g>
        <path d="M 366 16 Q 376 8 386 16" fill="#182a30" stroke="#2c4048" strokeWidth="0.8" />
        <path d="M 376 9 V 5" stroke="#2c4048" strokeWidth="1" />
        {/* near fog rolling over the rocks (animated) */}
        <g className="cth-fog-near">
          <rect x="-30" y="102" width="280" height="20" rx="10" fill="#dde2ce" fillOpacity="0.05" />
          <rect x="250" y="108" width="240" height="18" rx="9" fill="#dde2ce" fillOpacity="0.06" />
        </g>
        {/* fade into the card surface */}
        <rect x="0" y="106" width="448" height="24" fill="url(#cthNightFade)" />
      </svg>
    </div>
  );
}
