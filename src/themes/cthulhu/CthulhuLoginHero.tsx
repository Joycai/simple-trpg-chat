/**
 * Cthulhu login-card hero — the Elder Sign crowning Innsmouth port papers.
 *
 * The login card becomes the「因思茅斯港 · 通行登记」证书：a brass-rimmed
 * Elder Sign (五芒星 + 中央火焰之眼) flanked by fading gold rules sits where
 * the default Dice5 emblem would, and the default emblem is hidden by
 * [data-theme="cthulhu"] .default-login-icon { display:none } in theme.css.
 *
 * Both dark (Innsmouth fog) and light (faded archive) modes use the same
 * brass-gold currentColor — the palette swap is driven entirely by theme.css.
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
    </div>
  );
}
