/**
 * Rainglass login-card hero — 雨窗昼夜 · Wet Glass by Day, Neon Frost by Night.
 *
 * Two parts:
 *
 * 1. The Drop &amp; Ripples emblem (in-flow badge): a raindrop falling onto a
 *    glass surface, splashing three concentric ripples — replaces the default
 *    Dice5 emblem, which is hidden by
 *    [data-theme="rainglass"] .default-login-icon { display:none } in theme.css.
 *
 * 2. Two wet-glass droplet layers (absolutely positioned against the card,
 *    shrine-style always-both-rendered, CSS-swapped by mode):
 *    - Day:   sparse rain droplets with white specular highlights and two
 *             rivulets running down the pane; one droplet slowly slides down.
 *    - Night: dense condensation beads (cyan, a few soaking up neon magenta)
 *             plus two glowing drips streaking down the frost.
 *
 * All colors ride currentColor / CSS classes; the palette and the day/night
 * swap live entirely in src/themes/rainglass/theme.css.
 */

/** One glass droplet: translucent body + white specular catch-light. */
function Droplet({ x, y, r, o = 0.10 }: { x: number; y: number; r: number; o?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="currentColor" fillOpacity={o} stroke="currentColor" strokeOpacity={o * 3} strokeWidth="0.8" />
      <circle cx={x - r * 0.35} cy={y - r * 0.35} r={Math.max(r * 0.28, 0.7)} fill="#fff" fillOpacity="0.85" stroke="none" />
    </g>
  );
}

/** A condensation bead for the night frost — smaller, denser, more opaque. */
function Bead({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.6" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={Math.max(r * 0.25, 0.5)} fill="#fff" fillOpacity="0.7" stroke="none" />
    </g>
  );
}

export function RainglassLoginHero() {
  return (
    <div className="rainglass-login-hero" aria-hidden="true">
      <span className="rainglass-hero-rule rainglass-hero-rule-left" />
      <span className="rainglass-hero-badge">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="34"
          height="34"
        >
          {/* === Hero drop falling from the top === */}
          <path
            d="M 12 3 Q 9.5 9 12 12 Q 14.5 9 12 3 Z"
            fill="currentColor"
            fillOpacity="0.18"
            strokeWidth="0.95"
          />
          {/* Inner highlight curve giving the drop a glass shine */}
          <path d="M 11 5.5 Q 10.5 8 11 9.5" strokeWidth="0.45" opacity="0.7" />

          {/* === Water surface horizontal line === */}
          <path d="M 4 16 L 20 16" strokeWidth="0.55" opacity="0.55" />

          {/* === Three concentric impact ripples (decreasing opacity outward) === */}
          <ellipse cx="12" cy="16" rx="3" ry="0.7" strokeWidth="0.75" opacity="0.9" />
          <ellipse cx="12" cy="16" rx="5.5" ry="1.2" strokeWidth="0.5" opacity="0.55" />
          <ellipse cx="12" cy="16" rx="8" ry="1.7" strokeWidth="0.35" opacity="0.3" />

          {/* === Small splash droplet rebounding from the impact point === */}
          <circle cx="12" cy="14" r="0.45" fill="currentColor" stroke="none" />
        </svg>
        <span className="rainglass-hero-badge-ring" />
      </span>
      <span className="rainglass-hero-rule rainglass-hero-rule-right" />

      {/* ── Day: rain droplets + rivulets on the wet pane ── */}
      <svg
        className="rg-hero-glass rg-hero-glass-day"
        viewBox="0 0 448 150"
        preserveAspectRatio="xMidYMin meet"
      >
        <Droplet x={34} y={18} r={5} />
        <Droplet x={58} y={44} r={3} />
        <Droplet x={120} y={10} r={3.5} />
        <Droplet x={163} y={30} r={2.5} />
        <Droplet x={285} y={14} r={3} />
        <Droplet x={330} y={38} r={4.5} />
        <Droplet x={398} y={20} r={6} />
        <Droplet x={422} y={58} r={3} />
        {/* rivulet — a trail wandering down from the big left droplet */}
        <path
          d="M 36 24 C 33 44 40 58 36 76 C 33 92 39 104 36 118"
          stroke="currentColor"
          strokeOpacity="0.20"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <Droplet x={36} y={122} r={3} o={0.14} />
        {/* second, shorter rivulet on the right edge */}
        <path
          d="M 410 30 C 407 46 413 56 410 70"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        {/* the lone droplet sliding down (animated in theme.css) */}
        <g className="rg-anim-slide">
          <Droplet x={224} y={12} r={3.2} o={0.14} />
        </g>
      </svg>

      {/* ── Night: condensation beads + neon-lit drips on the frost ── */}
      <svg
        className="rg-hero-glass rg-hero-glass-night"
        viewBox="0 0 448 150"
        preserveAspectRatio="xMidYMin meet"
      >
        <Bead x={22} y={12} r={2.5} />
        <Bead x={40} y={30} r={1.8} />
        <Bead x={70} y={10} r={3} />
        <Bead x={118} y={18} r={1.6} />
        <Bead x={180} y={8} r={2} />
        <Bead x={240} y={14} r={2.4} />
        <Bead x={300} y={10} r={2.8} />
        <Bead x={332} y={30} r={2} />
        <Bead x={365} y={12} r={1.7} />
        <Bead x={424} y={44} r={2.2} />
        <Bead x={58} y={60} r={1.5} />
        <Bead x={390} y={62} r={1.9} />
        {/* beads soaking up the magenta sign outside (rg-accent → --theme-accent) */}
        <g className="rg-accent">
          <Bead x={96} y={40} r={2} />
          <Bead x={142} y={34} r={2.6} />
          <Bead x={268} y={36} r={1.8} />
          <Bead x={395} y={26} r={3} />
        </g>
        {/* glowing drips streaking down the frost (animated in theme.css) */}
        <rect className="rg-anim-drip" x={87} y={6} width={2.2} height={15} rx={1.1} fill="currentColor" fillOpacity="0.8" stroke="none" />
        <g className="rg-accent">
          <rect className="rg-anim-drip rg-anim-drip-b" x={351} y={6} width={2.2} height={15} rx={1.1} fill="currentColor" fillOpacity="0.8" stroke="none" />
        </g>
      </svg>
    </div>
  );
}
