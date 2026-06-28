/**
 * Rainglass login-card hero — 水珠涟漪 · the Drop &amp; Impact Ripples.
 *
 * Replaces the default Dice5 emblem with a single raindrop falling onto a
 * glass-like water surface, splashing out three concentric ripples — the
 * frozen physics-moment of "rain on glass" that names this theme.
 *
 * The whole figure is drawn in currentColor (which CSS sets to the active
 * mode's primary cyan — electric #22d3ee at night, deep teal #0891b2 by day).
 * The default emblem is hidden by
 * [data-theme="rainglass"] .default-login-icon { display:none } in theme.css.
 */
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
    </div>
  );
}
