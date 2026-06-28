/**
 * Parchment login-card hero — 盘剑龙印 · the Dragon-Sword Sigil.
 *
 * Replaces the default Dice5 emblem with a heraldic dragon coiled around an
 * upright sword — the adventurer's seal of medieval-manuscript / DND tradition.
 * The default emblem is hidden by
 * [data-theme="parchment"] .default-login-icon { display:none } in theme.css.
 *
 * Both dark (candlelit deep vellum) and light (daylight aged tan) modes use the
 * same currentColor — the palette swap is driven entirely by theme.css.
 */
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
    </div>
  );
}
