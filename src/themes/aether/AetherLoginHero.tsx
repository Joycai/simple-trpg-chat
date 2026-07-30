"use client";

import { useEffect, useState } from "react";

/**
 * Aether login-card hero — 黄铜铭板昼夜 · Brass Plate by Day, Broken Panel by Night.
 *
 * Three parts:
 *
 * 1. The Cosmic Compass emblem (in-flow badge): a brass compass rose whose
 *    North pointer rides --theme-accent (crystal cyan by night, verdigris by
 *    day). The default Dice5 emblem is hidden by
 *    [data-theme="aether"] .default-login-icon { display:none } in theme.css.
 *
 * 2. Day plate (light mode): a polished brass nameplate crowning the card —
 *    brushed metal, engraved double border, four slotted screws, an etched
 *    compass-diamond centre motif.
 *
 * 3. Night plate (dark mode): the same nameplate, aged and torn open — jagged
 *    breach with a bent flap and a missing screw, revealing the machinery
 *    behind the panel: sagging wires (one dangling loose, sparking) and two
 *    nixie tubes glowing warm orange through the gap. The tubes display the
 *    current day of month (user-local), set after mount via useEffect — SSR
 *    renders a fixed "42" so server/client timezone drift can never cause a
 *    hydration mismatch; the swap on mount reads as the tubes re-striking.
 *
 * Both plate layers are always rendered; the day/night swap, positioning and
 * the nixie-flicker / spark animations live in src/themes/aether/theme.css
 * (gated on [data-theme="aether"][data-mode]), keeping this component free of
 * any theme/mode branching — the same mechanism as shrine and rainglass.
 */

/** A slotted brass screw head (day plate). Slot angle alternates for realism. */
function Screw({ x, y, angle = 0 }: { x: number; y: number; angle?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <circle r="4.2" fill="#8a6a26" stroke="#5c4718" strokeWidth="1" />
      <path d="M -2.6 0 L 2.6 0" stroke="#5c4718" strokeWidth="1.1" strokeLinecap="round" />
      <circle r="4.2" fill="none" stroke="#ffe9b8" strokeWidth="0.5" strokeOpacity="0.5" />
    </g>
  );
}

/** A glowing nixie tube standing behind the breach (night plate). */
function NixieTube({ x, y, digit, dim = false }: { x: number; y: number; digit: string; dim?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* socket base + pins */}
      <rect x="1" y="50" width="24" height="6" rx="1.5" fill="#241a30" stroke="#3a2f52" strokeWidth="0.6" />
      <path d="M 6 56 V 60 M 13 56 V 60 M 20 56 V 60" stroke="#55431f" strokeWidth="1.2" />
      {/* glass envelope */}
      <rect x="0" y="0" width="26" height="52" rx="11" fill="#1b1424" stroke="#6e5530" strokeWidth="1.4" />
      <rect x="3" y="3" width="20" height="44" rx="9" fill="#f4a04a" fillOpacity={dim ? 0.08 : 0.12} />
      {/* glow halo + digit (flicker class applied to the lit parts) */}
      <g className="ae-nixie">
        <circle cx="13" cy="27" r="17" fill="#ff9c3a" fillOpacity={dim ? 0.10 : 0.15} />
        <text
          x="13"
          y="37"
          textAnchor="middle"
          fontFamily="'JetBrains Mono', ui-monospace, monospace"
          fontSize="26"
          fill="#ffb648"
          stroke="#ff8c2a"
          strokeWidth="0.5"
        >
          {digit}
        </text>
      </g>
      {/* anode grid in front of the digit */}
      <path
        d="M 5 15 H 21 M 5 22 H 21 M 5 29 H 21 M 5 36 H 21"
        stroke="#8a6d3b"
        strokeWidth="0.7"
        strokeOpacity="0.65"
      />
      {/* glass catch-light */}
      <path d="M 6 8 Q 4.5 22 6 38" stroke="#ffe9b8" strokeWidth="0.8" strokeOpacity="0.35" fill="none" />
    </g>
  );
}

/** Jagged outline of the torn breach — shared by the cavity fill, the plate
 *  cut-out (evenodd) and the lit/shadowed edge strokes so they always agree. */
const BREACH =
  "M 156 14 L 196 22 L 206 12 L 246 20 L 268 10 L 292 18 L 318 14 L 330 34 " +
  "L 322 52 L 332 66 L 306 74 L 272 66 L 246 76 L 212 68 L 182 74 L 162 60 " +
  "L 146 44 L 152 28 Z";

export function AetherLoginHero() {
  // Day of month shown on the nixie tubes. "42" until mounted (see doc above).
  const [day, setDay] = useState("42");
  useEffect(() => {
    // Mount-time sync with an external system (the clock) — same pattern and
    // rationale as ThemeProvider's localStorage read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(String(new Date().getDate()).padStart(2, "0"));
  }, []);

  return (
    <div className="aether-login-hero" aria-hidden="true">
      <span className="aether-hero-rule aether-hero-rule-left" />
      <span className="aether-hero-badge">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="34"
          height="34"
        >
          {/* === Outer brass ring === */}
          <circle cx="12" cy="12" r="10" strokeWidth="0.9" />

          {/* === Inner faded dashed ring (degree dial) === */}
          <circle cx="12" cy="12" r="8.4" strokeWidth="0.35" strokeDasharray="0.5 1.1" opacity="0.55" />

          {/* === Cardinal direction dots on the outer ring === */}
          <circle cx="12" cy="2" r="0.45" fill="currentColor" stroke="none" />
          <circle cx="22" cy="12" r="0.45" fill="currentColor" stroke="none" />
          <circle cx="12" cy="22" r="0.45" fill="currentColor" stroke="none" />
          <circle cx="2" cy="12" r="0.45" fill="currentColor" stroke="none" />

          {/* === 4 minor diagonal arms (NE/SE/SW/NW) — thin pointer lines === */}
          <path d="M 6.5 6.5 L 11 11" strokeWidth="0.5" />
          <path d="M 17.5 6.5 L 13 11" strokeWidth="0.5" />
          <path d="M 17.5 17.5 L 13 13" strokeWidth="0.5" />
          <path d="M 6.5 17.5 L 11 13" strokeWidth="0.5" />

          {/* === East / West / South major arms (brass kites) === */}
          {/* South arm */}
          <path d="M 12 20 L 12.7 12.5 L 12 12 L 11.3 12.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="0.35" />
          {/* East arm */}
          <path d="M 20 12 L 12.5 12.7 L 12 12 L 12.5 11.3 Z" fill="currentColor" stroke="currentColor" strokeWidth="0.35" />
          {/* West arm */}
          <path d="M 4 12 L 11.5 12.7 L 12 12 L 11.5 11.3 Z" fill="currentColor" stroke="currentColor" strokeWidth="0.35" />

          {/* === North arm (the hero — crystal cyan / verdigris kite) === */}
          <path
            d="M 12 4 L 12.7 11.5 L 12 12 L 11.3 11.5 Z"
            fill="rgb(var(--theme-accent))"
            stroke="currentColor"
            strokeWidth="0.4"
          />

          {/* === Fleur-de-lis crown above the N arm (signature ornament) === */}
          <path d="M 11.2 3 L 12 1.4 L 12.8 3" strokeWidth="0.6" />
          <circle cx="12" cy="2.3" r="0.3" fill="currentColor" stroke="none" />

          {/* === Inner small ring (central boss) === */}
          <circle cx="12" cy="12" r="1.8" fill="rgb(var(--theme-bg))" stroke="currentColor" strokeWidth="0.55" />

          {/* === Center crystal gem === */}
          <circle cx="12" cy="12" r="0.9" fill="rgb(var(--theme-accent))" stroke="none" />
        </svg>
        <span className="aether-hero-badge-ring" />
      </span>
      <span className="aether-hero-rule aether-hero-rule-right" />

      {/* ── Day: intact polished-brass nameplate crowning the card ── */}
      <svg
        className="ae-hero-plate ae-hero-plate-day"
        viewBox="0 0 448 84"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="aeDayBrass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ecd9a4" />
            <stop offset="0.45" stopColor="#cfae66" />
            <stop offset="0.8" stopColor="#b98f3a" />
            <stop offset="1" stopColor="#d0b070" />
          </linearGradient>
        </defs>
        {/* plate body + brushed-metal strokes */}
        <rect x="0" y="0" width="448" height="64" fill="url(#aeDayBrass)" />
        <path d="M 0 18 H 448 M 0 34 H 448 M 0 49 H 448" stroke="#7a5c1a" strokeWidth="0.5" strokeOpacity="0.12" />
        <path d="M 0 10 H 448 M 0 27 H 448 M 0 42 H 448" stroke="#fff6dc" strokeWidth="0.5" strokeOpacity="0.25" />
        {/* engraved double border (dark cut + light catch below it) */}
        <rect x="9" y="9" width="430" height="46" fill="none" stroke="#7a5c1a" strokeWidth="1" strokeOpacity="0.55" />
        <rect x="9" y="10" width="430" height="46" fill="none" stroke="#ffe9b8" strokeWidth="0.6" strokeOpacity="0.35" />
        {/* etched centre motif — compass diamond flanked by rules */}
        <path d="M 150 32 H 204" stroke="#7a5c1a" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 244 32 H 298" stroke="#7a5c1a" strokeWidth="1" strokeOpacity="0.5" />
        <path d="M 224 22 L 233 32 L 224 42 L 215 32 Z" fill="none" stroke="#7a5c1a" strokeWidth="1.2" strokeOpacity="0.6" />
        <path d="M 224 27 L 228.5 32 L 224 37 L 219.5 32 Z" fill="#7a5c1a" fillOpacity="0.45" />
        {/* four slotted screws */}
        <Screw x={18} y={16} angle={20} />
        <Screw x={430} y={16} angle={-35} />
        <Screw x={18} y={48} angle={70} />
        <Screw x={430} y={48} angle={10} />
        {/* plate bottom edge — shadow + light catch */}
        <rect x="0" y="64" width="448" height="2.5" fill="#55431f" fillOpacity="0.55" />
        <rect x="0" y="66.5" width="448" height="1" fill="#fff6dc" fillOpacity="0.45" />
      </svg>

      {/* ── Night: the same plate torn open — wires & nixie tubes behind ── */}
      <svg
        className="ae-hero-plate ae-hero-plate-night"
        viewBox="0 0 448 150"
        preserveAspectRatio="xMidYMin meet"
      >
        <defs>
          <linearGradient id="aeNightBrass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#97793f" />
            <stop offset="0.5" stopColor="#7a6132" />
            <stop offset="1" stopColor="#6e5530" />
          </linearGradient>
        </defs>

        {/* cavity behind the breach */}
        <path d={BREACH} fill="#0a0714" />

        {/* wires sagging inside the cavity (behind the tubes) */}
        <path d="M 152 28 C 190 48 240 42 300 30 L 318 22" fill="none" stroke="#7a3b2e" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M 152 28 C 190 48 240 42 300 30 L 318 22" fill="none" stroke="#e08258" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M 150 42 C 184 66 240 68 280 56 C 300 50 316 52 326 44" fill="none" stroke="#2e6e78" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M 150 42 C 184 66 240 68 280 56 C 300 50 316 52 326 44" fill="none" stroke="#5fd3da" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.8" />

        {/* nixie tubes peeking through the gap — today's day of month */}
        <NixieTube x={196} y={18} digit={day[0]} />
        <NixieTube x={252} y={22} digit={day[1]} dim />

        {/* the plate itself, with the breach cut out (evenodd) */}
        <path d={`M 0 0 H 448 V 84 H 0 Z ${BREACH}`} fill="url(#aeNightBrass)" fillRule="evenodd" />

        {/* aged surface: worn engraved border + verdigris patina stains */}
        <rect x="9" y="9" width="430" height="66" fill="none" stroke="#4a3814" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="14 6" />
        <ellipse cx="70" cy="58" rx="26" ry="10" fill="#3f8577" fillOpacity="0.16" />
        <ellipse cx="392" cy="26" rx="20" ry="8" fill="#3f8577" fillOpacity="0.14" />
        <ellipse cx="352" cy="64" rx="14" ry="6" fill="#3f8577" fillOpacity="0.12" />

        {/* torn edge: deep shadow underneath + lit brass rim */}
        <path d={BREACH} fill="none" stroke="#1a1206" strokeWidth="4.5" strokeOpacity="0.8" />
        <path d={BREACH} fill="none" stroke="#d8b878" strokeWidth="1.2" strokeOpacity="0.9" />

        {/* bent flap peeled from the right lip of the breach */}
        <path d="M 318 14 L 330 34 L 352 20 L 338 8 Z" fill="#97793f" stroke="#d8b878" strokeWidth="0.8" />
        <path d="M 318 14 L 330 34 L 352 20" fill="none" stroke="#2c1e08" strokeWidth="1.4" strokeOpacity="0.6" />

        {/* three screws hold; the top-right one is gone — empty threaded hole */}
        <Screw x={18} y={18} angle={20} />
        <Screw x={18} y={66} angle={70} />
        <Screw x={430} y={66} angle={-15} />
        <g transform="translate(430 18)">
          <circle r="4.2" fill="#17101f" stroke="#55431f" strokeWidth="1" />
          <path d="M -2.4 -1 A 2.6 2.6 0 0 0 2.4 -1 M -2.4 1.4 A 2.6 2.6 0 0 0 2.4 1.4" stroke="#55431f" strokeWidth="0.6" fill="none" />
        </g>

        {/* plate bottom edge */}
        <rect x="0" y="84" width="448" height="2.5" fill="#241a30" fillOpacity="0.8" />
        <rect x="0" y="86.5" width="448" height="1" fill="#d8b878" fillOpacity="0.25" />

        {/* a loose wire dangling out of the breach, frayed and sparking */}
        <path d="M 246 74 C 240 96 252 112 242 132" fill="none" stroke="#a8874f" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M 242 132 L 237 138 M 242 132 L 245 139 M 242 132 L 240 140" stroke="#a8874f" strokeWidth="1" strokeLinecap="round" />
        <g className="ae-spark">
          <path d="M 242 134 L 248 130 M 242 134 L 246 140 M 242 134 L 236 136 M 242 134 L 240 128" stroke="#ffd27a" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="242" cy="134" r="1.6" fill="#ffe9b8" />
        </g>
        {/* a shorter stub swaying by the left lip */}
        <path d="M 182 72 C 180 86 188 94 184 106" fill="none" stroke="#7a3b2e" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
