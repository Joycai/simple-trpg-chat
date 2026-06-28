/**
 * Aether login-card hero — 宇宙罗盘 · the Cosmic Compass Rose.
 *
 * Replaces the default Dice5 emblem with a brass compass rose — its North
 * pointer rendered in crystal cyan (dark mode) / sealing-wax red (light mode)
 * via --theme-accent, so the rose feels "wax-stamped" or "starlit" depending
 * on the active mode. The default emblem is hidden by
 * [data-theme="aether"] .default-login-icon { display:none } in theme.css.
 *
 * The compass-rose motif intentionally echoes the existing .conv-divider — the
 * hero is the divider's larger ceremonial form, crowning the login card.
 */
export function AetherLoginHero() {
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

          {/* === North arm (the hero — crystal cyan / sealing-wax red kite) === */}
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
    </div>
  );
}
