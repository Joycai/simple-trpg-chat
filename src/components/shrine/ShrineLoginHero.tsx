/**
 * Shrine login-card hero — the login card reads as a torii gate.
 *
 * Day  (light mode): the card's top edge becomes a torii lintel — a curved
 *                    kasagi crossbeam with upturned ends overhanging the card
 *                    sides, a shimaki beam, a central gakuzuka strut, and a
 *                    nuki tie-beam resting on the card. Paired with vermilion
 *                    pillar borders (in theme.css) the whole card is a gate.
 * Night (dark mode): the lintel gives way to a withered bough spanning the top,
 *                    with two stone lanterns hanging at its left and right ends,
 *                    flames flickering.
 *
 * Both layers are always rendered; the day/night swap and all positioning live
 * in src/themes/shrine/theme.css (gated on `[data-theme="shrine"][data-mode]`),
 * keeping this component free of any theme/mode branching. Beam fills use the
 * theme's own --theme-primary / --theme-accent so they track the palette.
 */
export function ShrineLoginHero() {
  return (
    <div className="shrine-login-hero" aria-hidden="true">
      {/* ── Day: torii lintel crowning the card ── */}
      <svg
        className="shrine-hero-day"
        viewBox="0 0 480 74"
        preserveAspectRatio="xMidYMin meet"
      >
        <g fill="rgb(var(--theme-primary))">
          {/* 笠木 kasagi — curved top beam, upturned ends, overhangs the pillars */}
          <path d="M2 26 C92 43 388 43 478 26 L478 43 C388 57 92 57 2 43 Z" />
          {/* 島木 shimaki — straight beam tucked beneath the kasagi */}
          <rect x="32" y="45" width="416" height="9" rx="2" />
          {/* 額束 gakuzuka — central strut */}
          <rect x="231" y="53" width="18" height="13" />
          {/* 貫 nuki — tie-beam resting on the card's top edge */}
          <rect x="48" y="61" width="384" height="11" rx="1.5" />
        </g>
        {/* gold crest line tracing the kasagi */}
        <path
          d="M2 24 C92 41 388 41 478 24"
          fill="none"
          stroke="rgb(var(--theme-accent))"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* 額 plaque on the gakuzuka */}
        <rect
          x="225"
          y="52"
          width="30"
          height="9"
          rx="1.5"
          fill="rgb(var(--theme-accent))"
        />
      </svg>

      {/* ── Night: withered bough hung with two stone lanterns ── */}
      <svg
        className="shrine-hero-night"
        viewBox="0 0 480 96"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <radialGradient id="shrineHeroFire" cx="50%" cy="40%" r="62%">
            <stop offset="0" stopColor="#ffe8b0" />
            <stop offset=".5" stopColor="#f4a73e" />
            <stop offset="1" stopColor="#9a3f15" />
          </radialGradient>
        </defs>

        {/* 枯木 — a gnarled bough arcing across the top */}
        <g
          fill="none"
          stroke="#4a3624"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M24 54 C150 26 330 26 456 54" strokeWidth="7" />
          {/* upward twigs */}
          <path d="M150 33 l-7 -13 M150 33 l5 -12" strokeWidth="3" />
          <path d="M240 27 l0 -14 M240 27 l-8 -10 M240 27 l8 -10" strokeWidth="3" />
          <path d="M330 33 l7 -13 M330 33 l-5 -12" strokeWidth="3" />
          {/* drooping twigs near the lantern ends */}
          <path d="M86 41 C80 48 80 54 86 60" strokeWidth="2.6" />
          <path d="M394 41 C400 48 400 54 394 60" strokeWidth="2.6" />
        </g>

        {/* 石灯籠 — lanterns hanging from the bough's ends */}
        <HangingLantern x={86} branchY={42} />
        <HangingLantern x={394} branchY={42} />
      </svg>
    </div>
  );
}

/** A small stone lantern suspended by a cord from a branch tip at (x, branchY). */
function HangingLantern({ x, branchY }: { x: number; branchY: number }) {
  return (
    <g transform={`translate(${x} ${branchY})`}>
      {/* hang cord */}
      <line x1="0" y1="-2" x2="0" y2="9" stroke="#3a2a1a" strokeWidth="1.4" />
      {/* warm halo */}
      <ellipse
        className="shrine-hero-glow"
        cx="0"
        cy="26"
        rx="24"
        ry="21"
        fill="#f4a73e"
        opacity="0.26"
      />
      {/* stone body */}
      <g fill="#23211d" stroke="#100e0c" strokeWidth="0.7" strokeLinejoin="round">
        <path d="M-10 13 h20 l-3 -4 h-14 z" /> {/* 笠 roof */}
        <rect x="-8.5" y="13" width="17" height="17" rx="2.5" /> {/* 火袋 body */}
        <rect x="-3" y="31" width="6" height="5" rx="1.5" /> {/* 基礎 base */}
      </g>
      {/* flickering flame window */}
      <rect
        className="shrine-hero-fire"
        x="-4.5"
        y="17"
        width="9"
        height="9"
        rx="1.6"
        fill="url(#shrineHeroFire)"
      />
    </g>
  );
}
