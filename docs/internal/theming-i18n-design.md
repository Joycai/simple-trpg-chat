# Theming & i18n — Implementation Guide (Simple TRPG Chat)

> **Status**: Authoritative reference for the theming system as built. Supersedes the
> original design draft (which used `--bg-primary`-style tokens and a per-room
> `rooms.theme`-only model). The live system uses `--theme-*` tokens, six themes, an
> orthogonal light/dark mode axis, and a three-tier resolution chain. Keep this file in
> sync when adding themes or tokens.

---

## 1. Mental Model

Theming has **two orthogonal axes**, applied as attributes on `<html>`:

| Axis | Attribute | Values | Source of truth |
| ---- | --------- | ------ | --------------- |
| **Theme** (palette + skin) | `data-theme` | `default` · `parchment` · `cthulhu` · `shrine` · `rainglass` · `aether` | `ThemeId` in [`src/themes/types.ts`](../../src/themes/types.ts) |
| **Color mode** | `data-mode` | resolved to `light` / `dark` (preference may be `auto`) | `ThemeMode` in [`src/themes/types.ts`](../../src/themes/types.ts) |

Every theme **must** ship both a light and a dark variant. 6 themes × 2 modes = 12 visual
combinations. Mode is *not* a theme — `auto` follows the OS via `prefers-color-scheme`.

**Hard rule** (stated in [`types.ts`](../../src/themes/types.ts)): no application or UI code
branches on a theme id. The UI renders entirely from the `THEMES` registry, and all
per-theme styling lives in that theme's own `theme.css`. If you find yourself writing
`if (theme === "cthulhu")` in a component, stop — push the difference into CSS.

---

## 2. Where Everything Lives

```
src/themes/
├── types.ts              # ThemeId union, THEME_MODES, THEMES registry, helpers
├── default/theme.css     # baseline (site default)
├── parchment/theme.css
├── cthulhu/theme.css
├── shrine/theme.css
├── rainglass/theme.css
└── aether/theme.css

src/app/
├── globals.css           # @import each theme.css + @theme inline token→Tailwind bridge
├── fonts.ts              # next/font registration; each font exposes a --font-* variable
└── layout.tsx            # SSR data-theme/data-mode + pre-paint FOUC script

src/components/theme/
├── ThemeProvider.tsx     # context, three-tier resolution, writes data-* on <html>
├── RoomThemeSetter.tsx   # pushes a room's theme/mode into the provider
├── ThemeSwitcher.tsx     # user-facing picker
└── AppProvider.tsx       # wires ThemeProvider into the tree

src/app/actions/theme.ts  # server actions: get/set site + user theme & mode
src/db/schema.ts          # users.themePreference/themeModePreference, rooms.theme/themeMode
```

---

## 3. What a Theme Can Define (the definable surface)

A theme controls three layers. Anything outside these is shared chrome (see §7).

### 3.1 Registry metadata — [`THEMES`](../../src/themes/types.ts)

Drives the theme picker UI. One `ThemeMeta` entry per theme:

| Field | Purpose |
| ----- | ------- |
| `name` / `nameEn` | Display name (zh / en) |
| `description` / `descriptionEn` | Description (zh / en) |
| `swatch.bg` / `swatch.border` | Preview color chips in the picker |
| `icon` | Optional emoji for plain `<option>` lists |

### 3.2 Design tokens — `--theme-*` CSS variables (~51 total)

Declared in each theme's `theme.css` under `[data-theme="<id>"]` (light baseline) and
`[data-theme="<id>"][data-mode="dark"]` (dark overrides). **28 are bridged to Tailwind
utilities** via `@theme inline` in [`globals.css`](../../src/app/globals.css) (so
`bg-surface`, `text-text`, `border-border`, `text-primary`, etc. work); the rest are
consumed directly through `var()` in component CSS.

**Base surfaces & text**
`--theme-bg` · `--theme-surface` · `--theme-surface-alt` · `--theme-border` ·
`--theme-text` · `--theme-text-muted` · `--theme-text-dim`

**Semantic role colors** (each principal role carries a `-hover` and `-foreground` triad)
`--theme-primary` · `--theme-accent` · `--theme-ai` (AI-feature accent) ·
plus `--theme-danger` · `--theme-success` · `--theme-warning`

**Per-region functional colors**
- Header: `--theme-header-bg` / `--theme-header-border`
- Inputs: `--theme-input-bg` / `--theme-input-border`
- Dice cards: `--theme-dice-card-bg` / `--theme-dice-card-border`
- Private chat: `--theme-private-bg` / `--theme-private-border`
- Scroll-to-bottom button: `--theme-scroll-btn`

**Skill-name palette**
`--theme-skill-0` … `--theme-skill-5` — 6 hues, assigned by hashing the skill name;
each mode tunes brightness so skill tags stay legible on that ground.

**Typography (three slots)**
`--theme-font` (body) · `--theme-font-display` (headings — auto-applied to `h1–h3` and
`.font-display`; opt out per element with `.no-display-font`) · `--theme-font-mono`.
Each references a `--font-*` variable registered in [`fonts.ts`](../../src/app/fonts.ts).

**Shape & skeuomorphic effects**
- Radius: `--theme-radius` plus per-corner `--theme-radius-tl/tr/br/bl` (Cthulhu zeroes
  these for a deliberate "non-Euclidean" hard-edged skeleton)
- `--theme-card-shadow` — overrides every `[class*="shadow"]` element
- `--theme-glow` — halo on active/selected (`[aria-selected="true"]`,
  `[data-state="active"]`, `.filter-tab-active`)
- `--theme-surface-texture` — image tiled on `body` (e.g. Cthulhu's base64 rust PNG)

**Decorative theme-local vars** (not required of every theme)
`--theme-sidebar-from/to/border` (conversation-sidebar gradient) · `--theme-divider`
(SVG separator — Cthulhu's is a "watching eye") · `--theme-shimenawa` (Shrine rope) ·
`--theme-border-mask`, etc. These are private to the theme that defines them.

### 3.3 Component-skin overrides

Beyond tokens, a theme may write full CSS (gradients, pseudo-elements, SVG badges, hover
motion) targeting a set of **semantic hook classes**. Currently themeable components:

| Hook class | Component |
| ---------- | --------- |
| `.conv-sidebar` / `.conv-tab` / `.conv-divider` | Conversation sidebar & tabs |
| `.chat-bubble` / `-own` / `-other` | Chat bubbles (Cthulhu adds an Elder-Sign star) |
| `.clue-card` / `.inventory-card` | Clue & inventory cards |
| `.filter-tab` / `.filter-indicator` / `.filter-tab-active` | Lobby filter tabs |
| `.theme-border` | Skeuomorphic bordered container (corner radii + glow) |

Always scope these as `[data-theme="<id>"] .hook` (and add `[data-mode="dark"]` when the
dark variant differs). Keep **all** of a theme's component overrides in its own
`theme.css` — nothing theme-specific belongs in `globals.css`.

---

## 4. Resolution Chain (which theme actually applies)

Both axes resolve through the same three-tier precedence in
[`ThemeProvider.tsx`](../../src/components/theme/ThemeProvider.tsx):

```
forced  >  room  >  user preference  >  site default
```

- **`activeTheme` = `forcedTheme || roomTheme || theme`**
  (`theme` = user pref `|| siteTheme || "default"`)
- **`activeMode` = `forcedMode ?? roomMode ?? mode`**, then `resolveMode()` turns `auto`
  into concrete `light`/`dark` against the live OS `prefers-color-scheme`.

Tier sources:
- **Forced** — administrative override, e.g. pinning the admin panel to a theme
  (`setForcedTheme` / `setForcedMode`).
- **Room** — [`RoomThemeSetter`](../../src/components/theme/RoomThemeSetter.tsx) pushes
  `rooms.theme` / `rooms.themeMode` while inside a room, and clears it on unmount. It also
  caches into `sessionStorage` (`room-theme-<id>` / `room-mode-<id>`) for the FOUC script.
- **User** — `users.themePreference` / `users.themeModePreference`, mirrored to
  `localStorage` (`trpg-theme` / `trpg-theme-mode`). `setTheme`/`setMode` persist via the
  server actions in [`theme.ts`](../../src/app/actions/theme.ts) (fire-and-forget).
- **Site** — server defaults from `getSiteTheme()` / `getSiteThemeMode()`.

### Anti-FOUC flow
[`layout.tsx`](../../src/app/layout.tsx) SSR-renders `data-theme`/`data-mode` from the
user/site values, then an **inline pre-paint script** in `<head>` upgrades them before
first paint: it reads the room cache from `sessionStorage` for `/rooms/<id>` routes and
resolves `auto` against `matchMedia('(prefers-color-scheme: dark)')`. This prevents a
light→dark (or wrong-theme) flash on navigation. The provider then takes over reactively.

---

## 5. Adding a New Theme (checklist)

Everything lives under `src/themes/<id>/` except the two registrations:

1. **Create** `src/themes/<id>/theme.css`.
2. **Define tokens** in a `[data-theme="<id>"]` block (light baseline) plus a
   `[data-theme="<id>"][data-mode="dark"]` block. Cover every token the UI consumes —
   start by copying `default/theme.css` and recoloring. Add any component-skin overrides
   in the same file.
3. **Add the id** to the `ThemeId` union in [`types.ts`](../../src/themes/types.ts).
4. **Add a `THEMES` entry** (names, descriptions, swatch, optional icon).
5. **`@import`** the file in [`globals.css`](../../src/app/globals.css) — CSS can't glob.
6. If the theme needs a new font, register it in [`fonts.ts`](../../src/app/fonts.ts)
   (use `preload: false` for concept fonts so they download only when active) and add its
   variable to the `fontVariables` list.
7. Also mirror the id into the `THEMES` enum in [`schema.ts`](../../src/db/schema.ts) so
   room-level validation accepts it.

No component code changes.

---

## 6. Conventions & Gotchas

- **Color format**: tokens store *space-separated RGB channels* (`37 99 235`), not
  `rgb()` / hex, so `@theme inline` can wrap them as `rgb(var(--token) / <alpha>)` and
  Tailwind opacity modifiers (`bg-surface/50`) work. Decorative vars that aren't bridged
  (gradients, shadows, SVG data URIs) may use any CSS color form.
- **Light is the baseline.** Put full token sets under the plain `[data-theme]` selector;
  the dark block only needs to *override* what changes.
- **Never hardcode colors** in components — use the semantic Tailwind tokens
  (`bg-surface`, `text-text`, `border-border`, `text-primary`, …). Arbitrary hex defeats
  theming and fails review.
- **Fonts** are wired indirectly: `theme.css` references `--font-*`, which `fonts.ts`
  attaches to `<html>`. The active `data-theme` just selects which family resolves.

---

## 7. NOT Themeable (shared chrome)

For contrast — these live in [`globals.css`](../../src/app/globals.css) and are identical
across all themes:

- **Overlay/modal motion** — enter/exit easing (`--ease-emphasized/exit/spring`),
  drawer/centered-modal/dropdown keyframes, and `prefers-reduced-motion` fallbacks. Kept
  in sync with `EXIT_DURATION` in [`useOverlayTransition.ts`](../../src/lib/useOverlayTransition.ts).
- **HP heartbeat effect** — `heartbeat` / `pulse-danger` / `shimmer` critical-HP
  animation, with hardcoded danger red.
- **Native UI** — scrollbars, form controls, and caret follow `color-scheme` driven by
  `data-mode`, not by any theme token.

---

## 8. i18n (current state)

- **Library**: `next-intl` v4 (App Router). Server config in `src/i18n/`. Default locale
  **`zh`**; `en` is the secondary.
- **Messages**: `messages/zh.json` and `messages/en.json`, namespaced by feature
  (`auth.*`, `lobby.*`, `room.*`, `avatar.*`, …). Theme display strings come from the
  `THEMES` registry (`name`/`nameEn`), **not** from message files — don't duplicate them.
- **Usage**: `t('namespace.key')` in components; both files must stay key-aligned.
- **Pitfall**: bare `<...>` angle brackets in a message string break next-intl's ICU
  parser and silently return the key instead of the text — escape or restructure. (See the
  `i18n-icu-angle-brackets` memory note.)
```
