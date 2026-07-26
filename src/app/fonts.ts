/**
 * Theme typography — self-hosted web fonts via next/font/local.
 *
 * The woff2 files live in `src/fonts/` and are committed to the repo, so the
 * production build never touches the network. (They were previously fetched
 * from Google Fonts at build time via `next/font/google`, which broke any
 * build on a machine that cannot reach fonts.googleapis.com.) Provenance and
 * regeneration steps: see `src/fonts/README.md`.
 *
 * Each font exposes a CSS variable (`variable`) that is referenced from the
 * per-theme `--theme-font*` declarations in src/themes/<id>/theme.css.
 * The variable classes are attached to <html> in layout.tsx, so the active
 * `data-theme` simply picks which family resolves.
 *
 * Only the default theme's fonts (Inter + JetBrains Mono) are preloaded; the
 * concept fonts use `preload: false` so they download on demand when their
 * theme is active, keeping the initial payload light.
 *
 * Only the `latin` subset is bundled, matching the previous
 * `subsets: ["latin"]` configuration. CJK glyphs therefore still fall back to
 * the system font — see README.md if that ever needs to change.
 */
import localFont from "next/font/local";

// --- Default (modern web) ---
const inter = localFont({
  src: [{ path: "../fonts/inter-wght.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: [{ path: "../fonts/space-grotesk-wght.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

const jetbrainsMono = localFont({
  src: [{ path: "../fonts/jetbrains-mono-wght.woff2", weight: "100 800", style: "normal" }],
  variable: "--font-jetbrains",
  display: "swap",
});

// --- Aged Parchment (western fantasy) ---
const crimsonText = localFont({
  src: [
    { path: "../fonts/crimson-text-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/crimson-text-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/crimson-text-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/crimson-text-600-italic.woff2", weight: "600", style: "italic" },
    { path: "../fonts/crimson-text-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/crimson-text-700-italic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-crimson",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const cinzel = localFont({
  src: [{ path: "../fonts/cinzel-wght.woff2", weight: "400 900", style: "normal" }],
  variable: "--font-cinzel",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const courierPrime = localFont({
  src: [
    { path: "../fonts/courier-prime-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/courier-prime-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-courier-prime",
  display: "swap",
  preload: false,
});

const lora = localFont({
  src: [
    { path: "../fonts/lora-wght.woff2", weight: "400 700", style: "normal" },
    { path: "../fonts/lora-wght-italic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const specialElite = localFont({
  src: [{ path: "../fonts/special-elite-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-special-elite",
  display: "swap",
  preload: false,
});

// --- Call of Cthulhu (cosmic / gothic horror) ---
const cormorant = localFont({
  src: [{ path: "../fonts/cormorant-garamond-wght.woff2", weight: "300 700", style: "normal" }],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

// --- Ancient Shrine (CJK mincho serif) ---
const shippori = localFont({
  src: [
    { path: "../fonts/shippori-mincho-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/shippori-mincho-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/shippori-mincho-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-shippori",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const notoSerifSC = localFont({
  src: [
    { path: "../fonts/noto-serif-sc-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/noto-serif-sc-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/noto-serif-sc-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-noto-serif-sc",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

// --- Azure Aether (skybound fantasy — elegant JRPG-menu serif) ---
const marcellus = localFont({
  src: [{ path: "../fonts/marcellus-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-marcellus",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

/** Space-separated variable class list to spread onto <html>. */
export const fontVariables = [
  inter.variable,
  spaceGrotesk.variable,
  jetbrainsMono.variable,
  crimsonText.variable,
  cinzel.variable,
  courierPrime.variable,
  cormorant.variable,
  shippori.variable,
  notoSerifSC.variable,
  marcellus.variable,
  lora.variable,
  specialElite.variable,
].join(" ");
