import type { CSSProperties } from "react";

export function ShrineLantern({ side = 'left', width = 60, bottom = 24 }:
  { side?: 'left' | 'right'; width?: number; bottom?: number }) {
  return (
    <div className="shrine-lantern"
         style={{ [side]: '7%', bottom, width, zIndex: 1 } as CSSProperties}>
      <div className="lglow" />
      <svg className="lan" viewBox="0 0 64 170">
        <defs>
          <radialGradient id="shrineFire" cx="50%" cy="42%" r="62%">
            <stop offset="0" stopColor="#ffe8b0" />
            <stop offset=".5" stopColor="#f4a73e" />
            <stop offset="1" stopColor="#9a3f15" />
          </radialGradient>
        </defs>
        <g fill="#23211d" stroke="#100e0c" strokeWidth=".7" strokeLinejoin="round">
          <path d="M12 162 L52 162 L48 150 L16 150 Z" />
          <path d="M19 150 L45 150 L43 142 Q32 138 21 142 Z" />
          <rect x="27" y="88" width="10" height="56" rx="3" />
          <rect x="23" y="111" width="18" height="6" rx="2" />
          <path d="M17 88 L47 88 L43 80 L21 80 Z" />
          <path d="M21 80 L17 64 L23 50 L41 50 L47 64 L43 80 Z" />
          <path d="M9 51 Q12 35 32 31 Q52 35 55 51 Q44 43 32 43 Q20 43 9 51 Z" />
          <path d="M9 51 Q5 47 8 43 Q12 46 12 50 Z" />
          <path d="M55 51 Q59 47 56 43 Q52 46 52 50 Z" />
          <circle cx="32" cy="25" r="5.5" />
          <path d="M29 30 h6 v4 h-6 z" />
        </g>
        <rect className="lfire" x="26" y="56" width="12" height="17" rx="2.5" fill="url(#shrineFire)" />
      </svg>
    </div>
  );
}

export function ShrineTorii() {
  return (
    <svg className="shrine-torii" viewBox="0 0 64 46" width={56} height={40}
         style={{ margin: '0 auto 8px', display: 'block' }}>
      <g fill="rgb(var(--theme-primary))">
        <rect x="2" y="2" width="60" height="8" rx="3" />
        <rect x="8" y="16" width="48" height="5" />
        <rect x="29" y="9" width="6" height="9" />
        <rect x="11" y="7" width="7" height="39" rx="2" />
        <rect x="46" y="7" width="7" height="39" rx="2" />
      </g>
      <rect x="1" y="1" width="62" height="3" rx="1.5" fill="rgb(var(--theme-accent))" />
    </svg>
  );
}
