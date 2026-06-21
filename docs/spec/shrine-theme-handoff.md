# Shrine Theme — Handoff to your repo (`simple-trpg-chat`)

Everything here targets **`src/themes/shrine/theme.css`** plus two small component
mounts. Your token architecture is identical to my mockup (`--theme-*` RGB triplets),
so most of this is a copy-paste of values. New things from our session:
**refined palette**, **deeper shadow**, the **Great Torii crest**, and **stone lanterns (石灯籠)**.

Your file already has: torii bubble seals, shimenawa `.conv-divider`, cedar
`.conv-sidebar`, washi `--theme-surface-texture`, torii-lintel cards. Keep all of that.

---

## 1 · Refined LIGHT palette — replace the var list in `[data-theme="shrine"] { … }`

Aged-grove regrounding: washi a touch deeper, cedar borders warmer, torii red toward
錆朱 (rusted vermilion), brass slightly antiqued, evergreen toward moss.

```css
  --theme-bg: 240 233 219;          /* aged 生成り washi */
  --theme-surface: 250 245 234;
  --theme-surface-alt: 231 220 199;
  --theme-border: 198 178 150;      /* weathered cedar line */
  --theme-text: 42 32 26;
  --theme-text-muted: 116 100 86;
  --theme-text-dim: 158 140 120;
  --theme-primary: 190 50 38;       /* 錆朱 rusted vermilion */
  --theme-primary-hover: 160 36 26;
  --theme-accent: 174 132 50;       /* antique brass */
  --theme-accent-hover: 144 106 32;
  --theme-success: 64 110 70;       /* 御神木 moss evergreen */
  --theme-header-bg: 235 224 204;
  --theme-header-border: 204 184 156;
  --theme-input-bg: 250 245 234;
  --theme-input-border: 202 184 158;
  --theme-dice-card-bg: 248 236 228;
  --theme-dice-card-border: 220 168 156;
  --theme-private-border: 190 50 38;
  --theme-private-bg: 248 235 229;
  --theme-scroll-btn: 190 50 38;
  --theme-primary-foreground: 250 245 234;
```

And deepen the card shadow (replace `--theme-card-shadow` in the light block):

```css
  --theme-card-shadow: 0 1px 2px rgba(70, 42, 20, 0.08),
                       0 5px 16px rgba(70, 42, 20, 0.13);
```

---

## 2 · Refined DARK palette (夜祭 night-festival) — replace the var list in `[data-theme="shrine"][data-mode="dark"] { … }`

Cooler sumi-night ground (slight indigo) so warm lantern light reads against it;
torii + brass lifted to glow.

```css
  --theme-bg: 22 20 27;             /* cool sumi night */
  --theme-surface: 35 30 33;        /* lantern-lit wood */
  --theme-surface-alt: 45 39 41;
  --theme-border: 80 64 56;
  --theme-text: 240 232 218;
  --theme-text-muted: 182 164 144;
  --theme-text-dim: 128 114 100;
  --theme-primary: 232 84 64;       /* glowing torii vermilion */
  --theme-primary-hover: 244 104 84;
  --theme-accent: 226 182 96;       /* lantern brass-gold */
  --theme-accent-hover: 240 198 112;
  --theme-ai: 124 152 212;
  --theme-header-bg: 27 24 31;
  --theme-header-border: 80 64 56;
  --theme-input-bg: 35 30 33;
  --theme-input-border: 86 70 60;
  --theme-dice-card-bg: 46 36 33;
  --theme-dice-card-border: 104 64 56;
  --theme-private-border: 232 84 64;
  --theme-private-bg: 48 33 31;
  --theme-scroll-btn: 232 84 64;
  --theme-primary-foreground: 255 250 244;

  --theme-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.5),
                       0 6px 16px rgba(0, 0, 0, 0.55);
```

> Your dark `.conv-sidebar` (`#2a2420 → #1e1916`) already looks right — leave it.

---

## 3 · NEW — append this block to the END of `theme.css`

Great Torii crest + stone lanterns. Lanterns are **dark-only**; the crest shows in both modes.

```css
/* ===== 鳥居 Great Torii crest (login hero) ===== */
.shrine-torii { display: none; }
[data-theme="shrine"] .shrine-torii { display: block; }

/* ===== 石灯籠 Stone lanterns — night only ===== */
.shrine-lantern { display: none; position: absolute; pointer-events: none; }
[data-theme="shrine"][data-mode="dark"] .shrine-lantern { display: block; }
.shrine-lantern .lan  { width: 100%; height: auto; display: block;
  filter: drop-shadow(0 7px 11px rgba(0,0,0,.55)); }
.shrine-lantern .lfire { transform-origin: center;
  filter: drop-shadow(0 0 5px rgba(247,178,78,.95)) drop-shadow(0 0 14px rgba(244,150,60,.55));
  animation: shrine-flicker 3.4s ease-in-out infinite; }
.shrine-lantern .lglow { position: absolute; left: 50%; top: 34%;
  width: 240%; height: 120px; transform: translate(-50%,-50%); border-radius: 50%;
  background: radial-gradient(ellipse at center,
    rgba(247,178,78,.30), rgba(247,160,70,.10) 45%, rgba(247,178,78,0) 72%); }
@keyframes shrine-flicker {
  0%,100% { opacity:.9 } 38% { opacity:1 } 54% { opacity:.84 } 72% { opacity:.97 }
}
```

---

## 4 · NEW — reusable React component `src/components/shrine/ShrineLantern.tsx`

```tsx
export function ShrineLantern({ side = 'left', width = 60, bottom = 24 }:
  { side?: 'left' | 'right'; width?: number; bottom?: number }) {
  return (
    <div className="shrine-lantern"
         style={{ [side]: '7%', bottom, width, zIndex: 1 } as React.CSSProperties}>
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
```

---

## 5 · Where to mount

- **Login** (`src/app/login/LoginForm.tsx`): put `<ShrineTorii />` just above the title,
  and add two lanterns to the page wrapper. The wrapper needs
  `position: relative; overflow: hidden;` and the form/card needs `position: relative; z-index: 2`
  so it stays above the lantern glow.
  ```tsx
  <ShrineLantern side="left" />
  <ShrineLantern side="right" />
  ```
- **Character modal** (the panel over the dark backdrop): same two lanterns inside the
  backdrop container (`position: relative; overflow: hidden`), flanking the panel; the
  panel already sits above them if it's `position: relative`.

---

## 6 · Paste-ready prompt for Claude Code (local)

> In `src/themes/shrine/theme.css`, replace the token values in the `[data-theme="shrine"]`
> and `[data-theme="shrine"][data-mode="dark"]` blocks with the refined palettes in
> `shrine-theme-handoff.md` §1–§2, and append the §3 CSS block at the end of the file.
> Create `src/components/shrine/ShrineLantern.tsx` from §4. Then mount `<ShrineTorii />`
> and two `<ShrineLantern>` on the login page, and two `<ShrineLantern>` inside the
> character-sheet modal backdrop, exactly as described in §5. Lanterns must only appear
> in `[data-theme="shrine"][data-mode="dark"]` (the CSS already gates this — just mount them
> unconditionally). Don't touch the other five themes.
```
```
